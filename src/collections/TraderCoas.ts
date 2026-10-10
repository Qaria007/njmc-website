import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig, FieldAccess, Payload, PayloadHandler, PayloadRequest } from 'payload'

import { type AiFile, aiErrorMessage, aiJson, AiReadError } from '../lib/ai.ts'
import {
  changedFromReading, cleanPrefix, cleanReading, COA_SCHEMA, COA_SYSTEM, coaGaps, coaNumber, type CoaDoc, type CoaReading, type CoaTest,
  type Issuer, type Licence, licenceLine, pickLicence, PRODUCT_TYPES, type Reading, specGaps, WATCHED,
} from '../lib/coa-docs.ts'
import { checkOriginal, type Original, renderCoaPdf, renderSpecPdf } from '../lib/coa-pdf.ts'
import { docPrefix, safeFileName } from '../lib/trade-docs.ts'
import { isStaff, signedIn } from './access.ts'
import { jsonBody, notJson } from './SupplierOrders.ts'
import { TRADE_FILES_DIR } from './TradeFiles.ts'
import { loadAi, loadSeller } from './TradeSettings.ts'

// Certificates on our letterhead (owner request 9 Oct 2026). Upload the supplier's certificate of
// analysis, let AI copy it into the fields (or type them), check them, preview, then issue:
// 1. the certificate of analysis issued by NJMC or a partner as distributor: our letterhead and
//    number, the manufacturer named, its certificate referred to and attached at the end;
// 2. a specification sheet for quoting: tests and limits only, no batch, no source.
// An issued certificate is locked: a correction is a new certificate with a new number.
// The rules are in src/lib/coa-docs.ts.

type AnyDoc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v).trim())
const idOf = (r: unknown) => (r && typeof r === 'object' ? (r as AnyDoc).id : (r as number | string | null | undefined))
const admin = (req: PayloadRequest) => isStaff(req)
const denied = () => Response.json({ error: 'Not allowed' }, { status: 403 })
const today = () => new Date().toISOString().slice(0, 10)
const date = (v: unknown) => (s(v) ? s(v).slice(0, 10) : '')

// What the certificate says cannot change once it is issued.
const untilIssued: FieldAccess = ({ req, doc }) => isStaff(req) && !(doc as AnyDoc | undefined)?.issuedAt
const locked = { access: { update: untilIssued } }

// Issued certificates are saved once, as printed, in the private documents folder (in the nightly
// backup of the order files), and every later copy is that file.
const ISSUED_DIR = path.join(TRADE_FILES_DIR, 'issued')
const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')

async function prefixOf(req: PayloadRequest, issuer: unknown): Promise<string> {
  const id = idOf(issuer)
  if (!id) return docPrefix()
  const c = (await req.payload.findByID({ collection: 'issuing-companies', id, depth: 0, overrideAccess: true, req }).catch(() => null)) as unknown as AnyDoc | null
  return c ? cleanPrefix(c.prefix, docPrefix()) : docPrefix()
}

// A new record (also a duplicate of an old one) starts without number or issue. It takes over the AI
// reading of the same supplier file, so a corrected copy still shows every change against it.
const fresh: CollectionBeforeChangeHook = async ({ data, operation, originalDoc, req }) => {
  if (operation === 'create') {
    for (const k of ['number', 'issuedAt', 'issuedBy', 'issuedFile', 'issuedSha256', 'reading', 'readingNotes', 'supplierIssuedBy']) delete data[k]
    data.issueDate = new Date().toISOString()
    const fileId = idOf(data.sourceFile)
    if (fileId) {
      const prev = await req.payload.find({ collection: 'trader-coas', where: { sourceFile: { equals: fileId } }, sort: '-updatedAt', limit: 20, depth: 0, overrideAccess: true, req })
      const withReading = (prev.docs as unknown as AnyDoc[]).find((d) => (d.reading as Reading | null)?.tests?.length)
      if (withReading) {
        data.reading = withReading.reading
        data.supplierIssuedBy = withReading.supplierIssuedBy
        data.readingNotes = withReading.readingNotes
      }
    }
    return data
  }
  // The number is never typed or cleared; it follows the letterhead until the certificate is issued.
  data.number = originalDoc?.number
  if (!originalDoc?.issuedAt && data.issuer !== undefined && String(idOf(data.issuer) ?? '') !== String(idOf(originalDoc?.issuer) ?? '')) {
    data.number = coaNumber(await prefixOf(req, data.issuer), new Date(String(originalDoc?.createdAt ?? Date.now())).getUTCFullYear(), Number(originalDoc?.id))
  }
  return data
}

// The number comes from the record id, so two certificates saved at the same moment never share one.
const numberOnCreate: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create' || s(doc.number)) return doc
  const number = coaNumber(await prefixOf(req, doc.issuer), new Date().getUTCFullYear(), Number(doc.id))
  await req.payload.db.updateOne({ collection: 'trader-coas', id: doc.id, data: { number }, req })
  return { ...doc, number }
}

// Choosing a client fills the customer name when it is empty.
const fromClient: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const clientId = idOf(data.client ?? originalDoc?.client)
  if (clientId && !s(data.customerName ?? originalDoc?.customerName) && !originalDoc?.issuedAt) {
    const c = (await req.payload.findByID({ collection: 'clients', id: clientId, depth: 0, overrideAccess: true, req }).catch(() => null)) as unknown as AnyDoc | null
    if (c) data.customerName = s(c.name)
  }
  return data
}

function toDoc(d: AnyDoc): CoaDoc {
  return {
    number: s(d.number), issueDate: date(d.issueDate) || today(),
    productName: s(d.productName), grade: s(d.grade), specification: s(d.specification), casNo: s(d.casNo),
    batchNo: s(d.batchNo), batchSize: s(d.batchSize), quantitySupplied: s(d.quantitySupplied),
    mfgDate: s(d.mfgDate), expiryDate: s(d.expiryDate), expiryKind: d.expiryKind === 'retest' ? 'retest' : 'expiry',
    packaging: s(d.packaging), storage: s(d.storage), customerName: s(d.customerName), customerRef: s(d.customerRef),
    manufacturerName: s(d.manufacturerName), manufacturerAddress: s(d.manufacturerAddress), manufacturerPhone: s(d.manufacturerPhone),
    originalCoaNo: s(d.originalCoaNo), originalCoaDate: s(d.originalCoaDate),
    resultsSource: d.resultsSource === 'lab' ? 'lab' : 'manufacturer',
    labName: s(d.labName), labAddress: s(d.labAddress), labPhone: s(d.labPhone), labReportNo: s(d.labReportNo), labReportDate: s(d.labReportDate),
    handling: d.handling === 'unchanged' || d.handling === 'repacked' ? d.handling : null,
    conclusion: s(d.conclusion), remarks: s(d.remarks), specNotes: s(d.specNotes), productType: s(d.productType) || null,
    tests: ((d.tests as CoaTest[] | null) ?? []).map((x) => ({ test: s(x.test), criteria: s(x.criteria), result: s(x.result), method: s(x.method) })),
  }
}

async function mediaLogo(logo: unknown): Promise<Issuer['logo']> {
  const name = logo && typeof logo === 'object' ? path.basename(s((logo as AnyDoc).filename)) : ''
  const type = /\.png$/i.test(name) ? 'png' : /\.jpe?g$/i.test(name) ? 'jpg' : null
  if (!type) return null
  try {
    return { data: new Uint8Array(await readFile(path.resolve(process.env.MEDIA_DIR || 'media', name))), type }
  } catch {
    return null
  }
}

// The chosen letterhead company, or Company details for documents.
async function loadIssuer(payload: Payload, doc: AnyDoc, req: PayloadRequest): Promise<Issuer & { licences?: Licence[] | null; chosen: boolean }> {
  const id = idOf(doc.issuer)
  if (id) {
    const c = (await payload.findByID({ collection: 'issuing-companies', id, depth: 1, overrideAccess: true, req })) as unknown as AnyDoc
    return {
      companyName: s(c.companyName), brandName: s(c.brandName), address: s(c.address), phone: s(c.phone), email: s(c.email), website: s(c.website),
      signatoryName: s(c.signatoryName), signatoryTitle: s(c.signatoryTitle), logo: await mediaLogo(c.logo),
      licences: c.licences as Licence[] | null, chosen: true,
    }
  }
  // Without a choice: Company details for documents, good for previews and specification sheets only.
  const seller = await loadSeller(payload, req)
  return { ...seller, chosen: false }
}

// The companies whose valid licence covers this kind of product today.
async function eligibleCompanies(req: PayloadRequest, productType: string | null | undefined, onDate: string) {
  if (!productType) return []
  const all = await req.payload.find({ collection: 'issuing-companies', limit: 200, depth: 0, pagination: false, overrideAccess: true, req })
  return (all.docs as unknown as AnyDoc[])
    .map((c) => ({ id: c.id, name: s(c.brandName) ? `${s(c.brandName)} (${s(c.companyName)})` : s(c.companyName), pick: pickLicence(c.licences as Licence[] | null, productType, onDate) }))
    .filter((c) => 'licence' in c.pick)
    .map((c) => ({ id: c.id, name: c.name, licence: 'licence' in c.pick ? licenceLine(c.pick.licence) : '' }))
}

// The supplier's original file from the private documents folder.
async function loadOriginal(payload: Payload, doc: AnyDoc, req: PayloadRequest): Promise<(Original & { name: string }) | null> {
  const id = idOf(doc.sourceFile)
  if (!id) return null
  const f = (await payload.findByID({ collection: 'trade-files', id, depth: 0, overrideAccess: true, req }).catch(() => null)) as unknown as AnyDoc | null
  const name = path.basename(s(f?.filename))
  const kind = /\.pdf$/i.test(name) ? 'pdf' : /\.(jpe?g|png|webp|heic|heif)$/i.test(name) ? 'image' : null
  if (!name || !kind) return null
  try {
    return { data: new Uint8Array(await readFile(path.join(TRADE_FILES_DIR, name))), name, kind }
  } catch {
    return null
  }
}

async function load(req: PayloadRequest): Promise<AnyDoc> {
  return (await req.payload.findByID({ collection: 'trader-coas', id: s(req.routeParams?.id), depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
}

async function gapsOf(req: PayloadRequest, doc: AnyDoc) {
  const d = toDoc(doc)
  const issuer = await loadIssuer(req.payload, doc, req)
  // The releasing company must hold a valid licence for this kind of product on the date of issue.
  // Checked for today until issued; issuing checks again on the day of issue.
  const pick = issuer.chosen ? pickLicence(issuer.licences, d.productType, doc.issuedAt ? d.issueDate : today()) : { problem: 'the company that releases this certificate (choose one in "Released by")' }
  if ('licence' in pick && pick.licence.printOnCertificate !== false) d.licence = licenceLine(pick.licence)
  const original = await loadOriginal(req.payload, doc, req)
  const reading = doc.reading as Reading | null
  const state = await checkOriginal(original)
  return {
    d, issuer, original, reading, state,
    coa: coaGaps(d, state, { issuer, issuedBy: s(doc.supplierIssuedBy), reading, sourceFile: idOf(doc.sourceFile) ?? null, fileSha256: original ? sha256(original.data) : null, licenceProblem: 'problem' in pick ? pick.problem : null }),
    spec: specGaps(d, issuer),
  }
}

// POST { replace? }: AI reads the uploaded certificate and fills the fields. The reading is kept, so
// any later change of a result, a limit or the manufacturer shows as a warning.
const readEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const body = await jsonBody<{ replace?: boolean }>(req)
  if (!body) return notJson()
  const doc = await load(req)
  if (doc.issuedAt) return Response.json({ error: 'This certificate is issued and locked. Duplicate it to make a corrected one.' }, { status: 400 })
  const ai = await loadAi(req.payload, req)
  if (!ai) return Response.json({ error: 'AI mode is off, or no API key is saved (Orders, Company details for documents). You can type the fields yourself.' }, { status: 400 })
  if (((doc.tests as unknown[]) ?? []).length && !body.replace) return Response.json({ error: 'This certificate already has test rows. Confirm to replace them.' }, { status: 409 })
  const orig = await loadOriginal(req.payload, doc, req)
  const state = await checkOriginal(orig)
  if (!orig || !state.ok) return Response.json({ error: state.ok ? "Upload the supplier's certificate first (PDF or a photo) and save." : `Cannot read: ${state.problem}.` }, { status: 400 })
  let file: AiFile
  try {
    file = orig.kind === 'pdf'
      ? { name: orig.name, mediaType: 'application/pdf', data: Buffer.from(orig.data).toString('base64') }
      : { name: orig.name.replace(/\.[^.]+$/, '.jpg'), mediaType: 'image/jpeg', data: (await sharp(Buffer.from(orig.data)).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer()).toString('base64') }
  } catch {
    return Response.json({ error: 'This picture could not be opened. Upload a PDF, JPG or PNG.' }, { status: 400 })
  }
  let r: CoaReading
  try {
    r = cleanReading(await aiJson<CoaReading>(ai.apiKey, ai.model, COA_SYSTEM, 'Copy this certificate of analysis into the fields.', COA_SCHEMA, 'certificate', [file]))
  } catch (e) {
    const x = e as { name?: string; status?: number; requestID?: string }
    req.payload.logger.error({ name: x?.name, status: x?.status, requestID: x?.requestID }, 'AI certificate reading failed')
    if (x?.status === 413) return Response.json({ error: 'The file is too large for the AI service. Upload only the certificate pages, or a smaller scan.' }, { status: 400 })
    return Response.json({ error: e instanceof AiReadError ? e.message : aiErrorMessage(e) }, { status: 502 })
  }
  if (!r.tests.length) return Response.json({ error: 'No test results were found on this file. Check that it is a certificate of analysis.' }, { status: 422 })
  const notes = [
    r.issuedBy && !r.manufacturerName ? `Issued by ${r.issuedBy}, a trader, without naming the manufacturer: ask the supplier for the manufacturer's own certificate.` : '',
    r.issuedBy && r.manufacturerName ? `Issued by ${r.issuedBy} (trader) for the manufacturer ${r.manufacturerName}.` : '',
    r.notes,
  ].filter(Boolean).join('\n')
  // A field the AI found empty keeps what was typed before.
  const keep = (k: keyof CoaReading) => (s(r[k]) ? s(r[k]) : s(doc[k]))
  const data: Record<string, unknown> = {}
  for (const k of ['productName', 'grade', 'specification', 'casNo', 'batchNo', 'batchSize', 'mfgDate', 'expiryDate', 'manufacturerName', 'manufacturerAddress', 'manufacturerPhone', 'originalCoaNo', 'originalCoaDate', 'packaging', 'storage', 'conclusion'] as const) data[k] = keep(k)
  if (r.expiryKind) data.expiryKind = r.expiryKind
  const fields = Object.fromEntries(WATCHED.map((k) => [k, s(data[k])]))
  const reading: Reading = { tests: r.tests, fields, sourceFile: idOf(doc.sourceFile) ?? null, sha256: sha256(orig.data), model: ai.model, at: new Date().toISOString() }
  await req.payload.update({
    collection: 'trader-coas', id: doc.id, depth: 0, overrideAccess: true, req,
    data: { ...data, tests: r.tests, supplierIssuedBy: r.issuedBy, reading, readingNotes: notes } as never,
  })
  // The uploaded file is a certificate: file it as one, so it shows with the PharmaTrust check.
  const fileId = idOf(doc.sourceFile)
  if (fileId) await req.payload.update({ collection: 'trade-files', id: fileId, depth: 0, overrideAccess: true, req, data: { kind: 'coa' } as never }).catch(() => null)
  return Response.json({ ok: true, tests: r.tests.length, notes })
}

// GET: what is missing for each PDF, and what changed since the AI reading.
const checkEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const doc = await load(req)
  const g = await gapsOf(req, doc)
  return Response.json({
    coa: g.coa, spec: g.spec, changes: changedFromReading(g.reading, g.d), licence: s(g.d.licence),
    eligible: await eligibleCompanies(req, g.d.productType, today()),
    readAt: s(g.reading?.at), aiOn: Boolean(await loadAi(req.payload, req)), hasOriginal: g.state.ok,
    issuedAt: s(doc.issuedAt), issuedBy: s(doc.issuedBy),
  })
}

// POST { confirm: true }: issue the certificate. From then on it prints without the draft mark and
// cannot be changed.
const issueEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const body = await jsonBody<{ confirm?: boolean }>(req)
  if (!body?.confirm) return notJson()
  const doc = await load(req)
  if (doc.issuedAt) return Response.json({ error: 'Already issued' }, { status: 400 })
  const now = new Date().toISOString()
  const g = await gapsOf(req, { ...doc, issueDate: now })
  if (g.coa.length || !g.original) return Response.json({ error: `Not ready: ${g.coa.join('; ')}` }, { status: 400 })
  let bytes: Uint8Array
  try {
    bytes = await renderCoaPdf(g.d, g.issuer, g.original)
  } catch {
    return Response.json({ error: "The supplier's file could not be attached. Upload it again as a PDF or a photo." }, { status: 400 })
  }
  const file = `${safeFileName(g.d.number).replace(/ /g, '_')}.pdf`
  await mkdir(ISSUED_DIR, { recursive: true })
  try {
    await writeFile(path.join(ISSUED_DIR, file), bytes, { flag: 'wx' })
  } catch {
    return Response.json({ error: 'A certificate with this number was already issued.' }, { status: 409 })
  }
  const who = req.user as { email?: string } | null
  await req.payload.update({
    collection: 'trader-coas', id: doc.id, depth: 0, overrideAccess: true, req,
    data: { issuedAt: now, issueDate: now, issuedBy: s(who?.email), issuedFile: file, issuedSha256: sha256(bytes) } as never,
  })
  return Response.json({ ok: true })
}

// GET /:id/pdf/coa | spec. The certificate prints as a marked draft until it is issued.
const pdfEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const type = s(req.routeParams?.type)
  if (type !== 'coa' && type !== 'spec') return Response.json({ error: 'Unknown document' }, { status: 404 })
  const doc = await load(req)
  let bytes: Uint8Array
  let name: string
  if (type === 'coa' && doc.issuedAt) {
    // The certificate exactly as issued.
    try {
      bytes = new Uint8Array(await readFile(path.join(ISSUED_DIR, path.basename(s(doc.issuedFile)))))
    } catch {
      return Response.json({ error: 'The issued file is missing from the server. Restore it from the backup of the order files.' }, { status: 500 })
    }
    if (sha256(bytes) !== s(doc.issuedSha256)) return Response.json({ error: 'The issued file on the server does not match the one issued. Restore it from the backup.' }, { status: 500 })
    name = `${s(doc.number)} CoA ${s(doc.productName)} ${s(doc.batchNo)}.pdf`
    return new Response(Buffer.from(bytes), {
      headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${safeFileName(name)}"`, 'Cache-Control': 'no-store' },
    })
  }
  const g = await gapsOf(req, doc)
  if (type === 'coa') {
    if (g.coa.length || !g.original) return Response.json({ error: `Not ready: ${g.coa.join('; ')}` }, { status: 400 })
    try {
      bytes = await renderCoaPdf(g.d, g.issuer, g.original, true)
    } catch {
      return Response.json({ error: "The supplier's file could not be attached. Upload it again as a PDF or a photo." }, { status: 400 })
    }
    name = `DRAFT ${g.d.number} CoA ${g.d.productName} ${g.d.batchNo}.pdf`
  } else {
    if (g.spec.length) return Response.json({ error: `Not ready: ${g.spec.join('; ')}` }, { status: 400 })
    bytes = await renderSpecPdf(g.d, g.issuer, today())
    name = `Specification ${g.d.productName} ${g.d.grade ?? ''}.pdf`
  }
  return new Response(Buffer.from(bytes), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${safeFileName(name)}"`, 'Cache-Control': 'no-store' },
  })
}

const noWrite = { create: () => false, update: () => false }

export const TraderCoas: CollectionConfig = {
  slug: 'trader-coas',
  labels: { singular: 'Certificate on our letterhead', plural: 'Certificates on our letterhead' },
  admin: {
    group: 'Certificates',
    useAsTitle: 'number',
    defaultColumns: ['number', 'productName', 'batchNo', 'manufacturerName', 'customerName', 'issuedAt'],
    listSearchableFields: ['number', 'productName', 'batchNo', 'manufacturerName', 'customerName'],
    description: "Upload the supplier's certificate of analysis. The tool prints it on your letterhead as distributor (the manufacturer stays named and its certificate is attached), and a specification sheet for quoting.",
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  hooks: { beforeChange: [fresh, fromClient], afterChange: [numberOnCreate] },
  endpoints: [
    { path: '/:id/read', method: 'post', handler: readEndpoint },
    { path: '/:id/check', method: 'get', handler: checkEndpoint },
    { path: '/:id/issue', method: 'post', handler: issueEndpoint },
    { path: '/:id/pdf/:type', method: 'get', handler: pdfEndpoint },
  ],
  fields: [
    { name: 'actions', type: 'ui', admin: { components: { Field: '/components/admin/TraderCoaActions#TraderCoaActions' } } },
    {
      type: 'row',
      fields: [
        { name: 'sourceFile', type: 'upload', relationTo: 'trade-files', label: "Supplier's certificate (PDF or photo)", ...locked, admin: { description: 'Upload it here or choose one from Documents' } },
        { name: 'issuer', type: 'relationship', relationTo: 'issuing-companies', label: 'Released by (company)', ...locked, admin: { description: 'Its letterhead and licence go on the certificate. The panel above lists the companies licensed for this product' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'number', type: 'text', label: 'Certificate No.', unique: true, index: true, access: noWrite, admin: { readOnly: true, description: 'Given on the first save' } },
        { name: 'issueDate', type: 'date', label: 'Date of issue', access: noWrite, admin: { readOnly: true, date: { displayFormat: 'yyyy-MM-dd' }, description: 'Set when the certificate is issued' } },
        { name: 'client', type: 'relationship', relationTo: 'clients' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'customerName', type: 'text', label: 'Customer (printed)', ...locked, admin: { description: 'Optional' } },
        { name: 'customerRef', type: 'text', label: 'Customer reference', ...locked, admin: { description: 'Order, PI or invoice number. Optional' } },
        { name: 'quantitySupplied', type: 'text', label: 'Quantity supplied', ...locked, admin: { description: 'e.g. 500 kg. Optional' } },
      ],
    },
    {
      type: 'collapsible',
      label: 'Product and batch',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'productName', type: 'text', required: true, label: 'Product', ...locked },
            { name: 'productType', type: 'select', label: 'Kind of product', options: PRODUCT_TYPES, ...locked, admin: { description: 'Decides which company may release it' } },
            { name: 'grade', type: 'text', ...locked, admin: { description: 'e.g. USP, EP, injection grade' } },
            { name: 'casNo', type: 'text', label: 'CAS No.', ...locked },
          ],
        },
        { name: 'specification', type: 'text', ...locked, admin: { description: 'The standard tested to, e.g. USP 2025' } },
        {
          type: 'row',
          fields: [
            { name: 'batchNo', type: 'text', label: 'Batch No.', ...locked },
            { name: 'batchSize', type: 'text', ...locked },
            { name: 'mfgDate', type: 'text', label: 'Manufacturing date', ...locked },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'expiryDate', type: 'text', label: 'Expiry or retest date', ...locked },
            { name: 'expiryKind', type: 'select', defaultValue: 'expiry', label: 'Which date', ...locked, options: [{ label: 'Expiry date', value: 'expiry' }, { label: 'Retest date', value: 'retest' }] },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'packaging', type: 'text', ...locked },
            { name: 'storage', type: 'text', ...locked },
          ],
        },
        {
          name: 'handling', type: 'radio', label: 'Did we repack or relabel the goods?', ...locked,
          admin: { description: 'Printed on the certificate. Choose one' },
          options: [{ label: "No, the manufacturer's original packaging", value: 'unchanged' }, { label: 'Yes, repacked or relabelled', value: 'repacked' }],
        },
      ],
    },
    {
      type: 'collapsible',
      label: 'Original manufacturer (always printed)',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'manufacturerName', type: 'text', label: 'Manufacturer', ...locked, admin: { description: 'The company that made the batch, not a trader' } },
            { name: 'manufacturerPhone', type: 'text', label: 'Telephone', ...locked, admin: { description: 'Required on a distributor certificate (ICH Q7 11.43)' } },
          ],
        },
        { name: 'manufacturerAddress', type: 'textarea', label: 'Manufacturing site address', ...locked, admin: { rows: 2 } },
        {
          type: 'row',
          fields: [
            { name: 'originalCoaNo', type: 'text', label: "Manufacturer's certificate No.", ...locked },
            { name: 'originalCoaDate', type: 'text', label: 'Dated', ...locked },
          ],
        },
        { name: 'supplierIssuedBy', type: 'text', label: 'Sent by a trader', access: noWrite, admin: { readOnly: true, condition: (d) => Boolean(d?.supplierIssuedBy), description: 'The certificate was issued by this trader, not the manufacturer' } },
        {
          name: 'resultsSource', type: 'radio', defaultValue: 'manufacturer', label: 'Results come from', ...locked,
          options: [{ label: "The manufacturer's certificate", value: 'manufacturer' }, { label: 'Our own retest at an independent laboratory', value: 'lab' }],
        },
        {
          type: 'row',
          admin: { condition: (d) => d?.resultsSource === 'lab' },
          fields: [
            { name: 'labName', type: 'text', label: 'Laboratory', ...locked },
            { name: 'labReportNo', type: 'text', label: 'Report No.', ...locked },
            { name: 'labReportDate', type: 'text', label: 'Dated', ...locked },
          ],
        },
        {
          type: 'row',
          admin: { condition: (d) => d?.resultsSource === 'lab' },
          fields: [
            { name: 'labAddress', type: 'text', label: 'Laboratory address', ...locked },
            { name: 'labPhone', type: 'text', label: 'Laboratory telephone', ...locked },
          ],
        },
      ],
    },
    {
      name: 'tests',
      type: 'array',
      label: 'Tests and results',
      labels: { singular: 'Test', plural: 'Tests' },
      ...locked,
      admin: { initCollapsed: false, description: 'Copied from the certificate. Change a result only to correct a misreading: every change shows as a warning above.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'test', type: 'text', required: true },
            { name: 'criteria', type: 'text', label: 'Acceptance criteria' },
            { name: 'result', type: 'text' },
            { name: 'method', type: 'text' },
          ],
        },
      ],
    },
    { name: 'conclusion', type: 'text', ...locked, admin: { description: 'As stated by the manufacturer, e.g. The batch complies with USP 2025' } },
    { name: 'remarks', type: 'textarea', label: 'Remarks on the certificate', ...locked, admin: { rows: 2 } },
    { name: 'specNotes', type: 'textarea', label: 'Remarks on the specification sheet', admin: { rows: 2, description: 'Printed on the specification sheet only' } },
    { name: 'readingNotes', type: 'textarea', label: 'What AI could not read', access: noWrite, admin: { readOnly: true, rows: 3, condition: (d) => Boolean(d?.readingNotes) } },
    {
      type: 'row',
      fields: [
        { name: 'issuedAt', type: 'date', label: 'Issued on', access: noWrite, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' }, condition: (d) => Boolean(d?.issuedAt) } },
        { name: 'issuedBy', type: 'text', label: 'Issued by', access: noWrite, admin: { readOnly: true, condition: (d) => Boolean(d?.issuedAt) } },
        { name: 'issuedSha256', type: 'text', label: 'Fingerprint of the issued PDF (SHA-256)', access: noWrite, admin: { readOnly: true, condition: (d) => Boolean(d?.issuedAt) } },
      ],
    },
    { name: 'issuedFile', type: 'text', access: noWrite, admin: { hidden: true } },
    // What AI read, kept to show later changes. Not editable.
    { name: 'reading', type: 'json', access: noWrite, admin: { hidden: true } },
  ],
}
