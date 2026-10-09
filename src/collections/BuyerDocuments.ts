import type { CollectionBeforeChangeHook, CollectionBeforeValidateHook, CollectionConfig, PayloadHandler, PayloadRequest } from 'payload'

import { randomBytes } from 'node:crypto'

import { clientMessage, saleMargin } from '../lib/order-desk.ts'
import { SHARE_DAYS, waLink, waNumber } from '../lib/share.ts'
import { SITE_URL } from '../lib/site.ts'
import { docSpecXlsx } from '../lib/order-desk-xlsx.ts'
import { type BuyerDoc, buyerDocGaps, buyerDocSpec, type BuyerDocType, type BuyerItem, emailsIn, safeFileName } from '../lib/trade-docs.ts'
import { renderPdf } from '../lib/trade-pdf.ts'
import { signedIn } from './access.ts'
import { CURRENCIES, INCOTERMS, jsonBody, nextNumber, notJson } from './SupplierOrders.ts'
import { loadSeller } from './TradeSettings.ts'

type AnyDoc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const day = (v: unknown) => s(v).slice(0, 10)
const admin = (req: PayloadRequest) => req.user?.collection === 'users'
export const TYPES: BuyerDocType[] = ['pi', 'invoice', 'packing-list']

function toDoc(d: AnyDoc): BuyerDoc {
  return {
    piNumber: s(d.piNumber), piDate: day(d.piDate), invoiceNumber: s(d.invoiceNumber), invoiceDate: day(d.invoiceDate),
    buyerName: s(d.buyerName), buyerAddress: s(d.buyerAddress), buyerCountry: s(d.buyerCountry), buyerContact: s(d.buyerContact),
    consignee: s(d.consignee), notifyParty: s(d.notifyParty), buyerReference: s(d.buyerReference),
    items: ((d.items as BuyerItem[]) ?? []).map((i) => ({ ...i })),
    currency: s(d.currency), incoterm: s(d.incoterm), incotermPlace: s(d.incotermPlace), paymentTerms: s(d.paymentTerms),
    portOfLoading: s(d.portOfLoading), portOfDischarge: s(d.portOfDischarge), shipmentBy: s(d.shipmentBy), deliveryTime: s(d.deliveryTime),
    validity: day(d.validity), vessel: s(d.vessel), blNumber: s(d.blNumber), shippingMarks: s(d.shippingMarks),
    freight: d.freight as number | null, insurance: d.insurance as number | null, discount: d.discount as number | null, remarks: s(d.remarks),
  }
}

const idOf = (r: unknown) => (r && typeof r === 'object' ? (r as AnyDoc).id : (r as number | string | null | undefined))
const PARTY = [['buyerName', 'name'], ['buyerAddress', 'address'], ['buyerCountry', 'country'], ['buyerContact', 'contactPerson'], ['buyerEmail', 'email'], ['buyerPhone', 'phone'], ['consignee', 'consignee'], ['notifyParty', 'notifyParty']]
const TERMS = [['incoterm', 'incoterm'], ['incotermPlace', 'incotermPlace'], ['paymentTerms', 'paymentTerms']]

// Choosing a client copies its details. A new or changed client replaces the buyer's name, address
// and contacts; the terms are only filled where empty, and the currency only on a new record (so
// prices already typed never change currency).
const fromClient: CollectionBeforeValidateHook = async ({ data, originalDoc, operation, req }) => {
  if (!data) return data
  const clientId = idOf(data.client ?? originalDoc?.client)
  if (!clientId) return data
  const changed = String(clientId) !== String(idOf(originalDoc?.client) ?? '')
  const c = (await req.payload.findByID({ collection: 'clients', id: clientId, depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  const now = (k: string) => s(data[k] !== undefined ? data[k] : originalDoc?.[k])
  for (const [mine, theirs] of PARTY) if (s(c[theirs]) && (changed || !now(mine))) data[mine] = c[theirs]
  for (const [mine, theirs] of TERMS) if (s(c[theirs]) && !now(mine)) data[mine] = c[theirs]
  if (operation === 'create' && s(c.currency)) data.currency = c.currency
  return data
}

const numbers: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation === 'create' || !s(data.piNumber ?? originalDoc?.piNumber)) data.piNumber = s(data.piNumber) || (await nextNumber(req.payload, 'buyer-documents', 'piNumber', 'PI', req))
  // The invoice number is given when the invoice date is first filled in, so a proforma that never
  // ships does not use up an invoice number.
  const invoiceNumber = s(operation === 'create' ? data.invoiceNumber : (data.invoiceNumber ?? originalDoc?.invoiceNumber))
  if (!invoiceNumber && (data.invoiceDate ?? originalDoc?.invoiceDate)) data.invoiceNumber = await nextNumber(req.payload, 'buyer-documents', 'invoiceNumber', 'INV', req)
  if (data.invoiceNumber === '') data.invoiceNumber = null
  if (!data.piDate && !originalDoc?.piDate) data.piDate = new Date().toISOString()
  return data
}

// GET /api/buyer-documents/:id/pdf/pi | invoice | packing-list
const pdfEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const type = s(req.routeParams?.type) as BuyerDocType
  if (!TYPES.includes(type)) return Response.json({ error: 'Unknown document' }, { status: 404 })
  const doc = (await req.payload.findByID({ collection: 'buyer-documents', id: s(req.routeParams?.id), depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  const spec = buyerDocSpec(toDoc(doc), await loadSeller(req.payload, req), type)
  return new Response(Buffer.from(await renderPdf(spec)), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${safeFileName(spec.fileName)}"`, 'Cache-Control': 'no-store' },
  })
}

// GET /api/buyer-documents/:id/xlsx/pi | invoice | packing-list: the same document as an Excel file.
const xlsxEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const type = s(req.routeParams?.type) as BuyerDocType
  if (!TYPES.includes(type)) return Response.json({ error: 'Unknown document' }, { status: 404 })
  const doc = (await req.payload.findByID({ collection: 'buyer-documents', id: s(req.routeParams?.id), depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  const spec = buyerDocSpec(toDoc(doc), await loadSeller(req.payload, req), type)
  return new Response(new Uint8Array(await docSpecXlsx(spec)), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeFileName(spec.fileName.replace(/\.pdf$/, '.xlsx'))}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// POST { type }: the private link to this document for the client, and a WhatsApp link that opens
// the sender's own WhatsApp with the message ready. Nothing is sent from here.
const shareEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const body = await jsonBody<{ type?: string }>(req)
  if (!body) return notJson()
  const type = s(body.type) as BuyerDocType
  if (!TYPES.includes(type)) return Response.json({ error: 'Unknown document' }, { status: 400 })
  let doc = (await req.payload.findByID({ collection: 'buyer-documents', id: s(req.routeParams?.id), depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  if (doc.status === 'cancelled') return Response.json({ error: 'This sale is cancelled' }, { status: 400 })
  const fresh = s(doc.shareToken) && Date.now() - Date.parse(s(doc.shareCreatedAt)) < (SHARE_DAYS - 7) * 86_400_000
  if (!fresh) {
    doc = (await req.payload.update({
      collection: 'buyer-documents', id: doc.id, depth: 0, overrideAccess: true, req,
      data: { shareToken: randomBytes(24).toString('base64url'), shareCreatedAt: new Date().toISOString() } as never,
    })) as unknown as AnyDoc
  }
  const seller = await loadSeller(req.payload, req)
  const url = `${SITE_URL.replace(/\/$/, '')}/d/${s(doc.shareToken)}/${type}`
  const m = clientMessage(toDoc(doc), seller, type)
  // WhatsApp carries a link, not an attachment.
  const text = `${m.body.split('\n\nBest regards')[0].replace('Please find attached', 'Here is')}\n\n${url}\n\n${seller.companyName}`
  const log = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC: WhatsApp link for the ${type === 'pi' ? 'proforma invoice' : type} prepared by ${s(req.user?.email)}`
  await req.payload.update({ collection: 'buyer-documents', id: doc.id, depth: 0, overrideAccess: true, req, data: { sendLog: [s(doc.sendLog), log].filter(Boolean).join('\n') } as never })
  return Response.json({ url, wa: waLink(doc.buyerPhone, text), phone: waNumber(doc.buyerPhone) })
}

// The document behind a client's private link, or null when the link is wrong, old or cancelled.
export async function saleByShareToken(token: string, req?: PayloadRequest) {
  if (!/^[A-Za-z0-9_-]{30,40}$/.test(token) || !req) return null
  const res = await req.payload.find({ collection: 'buyer-documents', where: { shareToken: { equals: token } }, limit: 2, depth: 0, overrideAccess: true, req })
  if (res.docs.length !== 1) return null
  const doc = res.docs[0] as unknown as AnyDoc
  if (doc.status === 'cancelled' || Date.now() - Date.parse(s(doc.shareCreatedAt)) > SHARE_DAYS * 86_400_000) return null
  return doc
}

export async function sharedPdf(doc: AnyDoc, type: BuyerDocType, req: PayloadRequest) {
  const spec = buyerDocSpec(toDoc(doc), await loadSeller(req.payload, req), type)
  return { bytes: await renderPdf(spec), fileName: safeFileName(spec.fileName) }
}

const checkEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const doc = (await req.payload.findByID({ collection: 'buyer-documents', id: s(req.routeParams?.id), depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  const seller = await loadSeller(req.payload, req)
  const d = toDoc(doc)
  return Response.json({
    gaps: Object.fromEntries(TYPES.map((t) => [t, buyerDocGaps(d, seller, t)])),
    messages: Object.fromEntries(TYPES.map((t) => [t, clientMessage(d, seller, t)])),
    to: emailsIn(doc.buyerEmail),
    copyTo: emailsIn(seller.copyTo),
    you: s(req.user?.email),
    margin: saleMargin({ items: (doc.items as never) ?? [] }),
    currency: s(doc.currency) || 'USD',
    sendLog: s(doc.sendLog),
  })
}

// POST { type, subject, message, excel?, confirm | test }: emails the document (PDF, and the Excel when
// asked) to the client, or with { test } only to the signed-in user. Nothing goes without confirm.
const sendEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const body = await jsonBody<{ type?: string; subject?: string; message?: string; excel?: boolean; confirm?: boolean; test?: boolean }>(req)
  if (!body) return notJson()
  const type = s(body.type) as BuyerDocType
  if (!TYPES.includes(type)) return Response.json({ error: 'Unknown document' }, { status: 400 })
  if (!body.confirm && !body.test) return Response.json({ error: 'Confirmation is required' }, { status: 400 })
  if (!process.env.SMTP_HOST && (body.confirm || process.env.NODE_ENV === 'production')) return Response.json({ error: 'Email is not set up on this server, nothing was sent' }, { status: 503 })
  const doc = (await req.payload.findByID({ collection: 'buyer-documents', id: s(req.routeParams?.id), depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  if (doc.status === 'cancelled') return Response.json({ error: 'This sale is cancelled' }, { status: 400 })
  const seller = await loadSeller(req.payload, req)
  const d = toDoc(doc)
  const blocking = buyerDocGaps(d, seller, type).filter((g) => /^(no items|a price or quantity|bank details|the invoice date|some text)/.test(g))
  if (body.confirm && blocking.length) return Response.json({ error: `Not sent: ${blocking.join('; ')}` }, { status: 400 })
  const spec = buyerDocSpec(d, seller, type)
  const auto = clientMessage(d, seller, type)
  const subject = s(body.subject).trim().slice(0, 300) || auto.subject
  const text = s(body.message).trim().slice(0, 20000) || auto.body
  const attachments: { filename: string; content: Buffer; contentType: string }[] = [{ filename: safeFileName(spec.fileName), content: Buffer.from(await renderPdf(spec)), contentType: 'application/pdf' }]
  if (body.excel) attachments.push({ filename: safeFileName(spec.fileName.replace(/\.pdf$/, '.xlsx')), content: await docSpecXlsx(spec), contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const mail = { from: `"${seller.companyName.replace(/["\\\r\n]/g, '')}" <${process.env.MAIL_FROM || 'sale@njmcmedicsupp.com'}>`, replyTo: emailsIn(seller.email)[0], subject, text, attachments }
  const failed = (err: unknown) => {
    req.payload.logger.error({ err }, 'client message failed')
    return Response.json({ error: `The email could not be sent: ${(err as Error).message}`.slice(0, 300) }, { status: 502 })
  }
  if (body.test) {
    const me = emailsIn(req.user?.email)
    if (!me.length) return Response.json({ error: 'Your login has no email address' }, { status: 400 })
    try {
      await req.payload.sendEmail({ ...mail, to: me, subject: `[TEST, not sent to the client] ${subject}` })
    } catch (err) {
      return failed(err)
    }
    return Response.json({ ok: true, test: true, to: me })
  }
  const to = emailsIn(doc.buyerEmail)
  if (!to.length) return Response.json({ error: "No client email: fill in the client's email and save" }, { status: 400 })
  const cc = emailsIn(seller.copyTo).filter((e) => !to.includes(e))
  try {
    await req.payload.sendEmail({ ...mail, to, ...(cc.length ? { cc } : {}) })
  } catch (err) {
    return failed(err)
  }
  const now = new Date().toISOString()
  const label = { pi: 'Proforma invoice', invoice: 'Commercial invoice', 'packing-list': 'Packing list' }[type]
  const log = `${now.slice(0, 16).replace('T', ' ')} UTC: ${label} sent to ${to.join(', ')}${body.excel ? ' (PDF and Excel)' : ''} by ${s(req.user?.email)}`
  let warning = ''
  try {
    await req.payload.update({
      collection: 'buyer-documents', id: doc.id, depth: 0, overrideAccess: true, req,
      data: { status: type === 'pi' && doc.status === 'draft' ? 'PI sent' : doc.status, sendLog: [s(doc.sendLog), log].filter(Boolean).join('\n') } as never,
    })
  } catch (err) {
    req.payload.logger.error({ err }, `client document ${s(doc.piNumber)} was sent but the record could not be updated`)
    warning = 'The email WAS sent, but the record could not be updated. Do not send it again.'
  }
  return Response.json({ ok: true, to, cc, ...(warning ? { warning } : {}) })
}

// One record per sale to a buyer: it prints the proforma invoice, the commercial invoice and the
// packing list from the same items. Private: buyer names and prices.
export const BuyerDocuments: CollectionConfig = {
  slug: 'buyer-documents',
  labels: { singular: 'Buyer documents (PI, invoice, packing list)', plural: 'Buyer documents (PI, invoice, packing list)' },
  admin: {
    group: 'Orders',
    useAsTitle: 'piNumber',
    defaultColumns: ['piNumber', 'buyerName', 'status', 'piDate'],
    description: 'Fill in the buyer, the items and the prices once. The proforma invoice, the invoice and the packing list are printed from the same record.',
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  hooks: { beforeValidate: [fromClient], beforeChange: [numbers] },
  endpoints: [
    { path: '/:id/pdf/:type', method: 'get', handler: pdfEndpoint },
    { path: '/:id/xlsx/:type', method: 'get', handler: xlsxEndpoint },
    { path: '/:id/check', method: 'get', handler: checkEndpoint },
    { path: '/:id/send', method: 'post', handler: sendEndpoint },
    { path: '/:id/share', method: 'post', handler: shareEndpoint },
  ],
  timestamps: true,
  fields: [
    { name: 'actions', type: 'ui', admin: { components: { Field: '/components/admin/BuyerDocActions#BuyerDocActions' } } },
    {
      type: 'row',
      fields: [
        { name: 'piNumber', type: 'text', label: 'PI no.', unique: true, index: true, admin: { description: 'Given automatically; you can change it' } },
        { name: 'piDate', type: 'date', label: 'PI date', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
        { name: 'validity', type: 'date', label: 'PI valid until', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
        {
          name: 'status', type: 'select', defaultValue: 'draft',
          options: ['draft', 'PI sent', 'confirmed', 'paid', 'in production', 'shipped', 'delivered', 'closed', 'cancelled'].map((v) => ({ label: v, value: v })),
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'invoiceNumber', type: 'text', label: 'Invoice no.', unique: true, index: true, admin: { description: 'Given automatically when you fill in the invoice date. Also printed on the packing list' } },
        { name: 'invoiceDate', type: 'date', label: 'Invoice date', admin: { date: { displayFormat: 'yyyy-MM-dd' }, description: 'Fill in when the goods ship' } },
        { name: 'buyerReference', type: 'text', label: "Buyer's order reference" },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'client', type: 'relationship', relationTo: 'clients', admin: { description: 'Choose the client and save: the buyer details below fill in by themselves' } },
        { name: 'buyerEmail', type: 'text', label: 'Send documents to (email)', admin: { description: 'Several addresses: separate with commas' } },
        { name: 'buyerPhone', type: 'text', label: 'Client WhatsApp', admin: { description: 'With the country code, e.g. +967 777 123 456' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'buyerName', type: 'text', required: true, label: 'Buyer (company)' },
        { name: 'buyerCountry', type: 'text', label: 'Country' },
        { name: 'buyerContact', type: 'text', label: 'Contact person' },
      ],
    },
    { name: 'buyerAddress', type: 'textarea', label: 'Buyer address', admin: { rows: 3 } },
    {
      type: 'row',
      fields: [
        { name: 'consignee', type: 'textarea', admin: { rows: 3, description: 'Only if different from the buyer' } },
        { name: 'notifyParty', type: 'textarea', admin: { rows: 3 } },
      ],
    },
    {
      name: 'items', type: 'array', labels: { singular: 'Item', plural: 'Items' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'description', type: 'text', required: true, label: 'Description of goods' },
            { name: 'spec', type: 'text', label: 'Grade / specification' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'quantity', type: 'number', min: 0 },
            { name: 'unit', type: 'text', defaultValue: 'kg' },
            { name: 'unitPrice', type: 'number', min: 0, label: 'Unit price (selling)' },
            { name: 'hsCode', type: 'text', label: 'HS code' },
            { name: 'origin', type: 'text', defaultValue: 'China' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'packages', type: 'number', min: 0, label: 'Number of packages', admin: { description: 'Packing list' } },
            { name: 'packageType', type: 'text', label: 'Package', admin: { description: 'e.g. 25 kg fibre drums' } },
            { name: 'netWeight', type: 'number', min: 0, label: 'Net weight (kg)' },
            { name: 'grossWeight', type: 'number', min: 0, label: 'Gross weight (kg)' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'batchNo', type: 'text', label: 'Batch no.' },
            { name: 'mfgDate', type: 'text', label: 'Manufacturing date' },
            { name: 'expDate', type: 'text', label: 'Expiry date' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'costPrice', type: 'number', min: 0, label: 'Our cost per unit (never printed)', admin: { description: 'In the currency of this document' } },
            { name: 'costSupplier', type: 'relationship', relationTo: 'suppliers', label: 'Bought from (never printed)' },
            { name: 'costNote', type: 'text', label: 'Where the cost comes from', admin: { readOnly: true } },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'currency', type: 'select', defaultValue: 'USD', options: CURRENCIES.map((v) => ({ label: v, value: v })) },
        { name: 'incoterm', type: 'select', label: 'Price basis', options: INCOTERMS.map((v) => ({ label: v, value: v })) },
        { name: 'incotermPlace', type: 'text', label: 'Port or place', admin: { description: 'e.g. Aden' } },
        { name: 'paymentTerms', type: 'text', admin: { description: 'e.g. 100% T/T in advance' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'freight', type: 'number', min: 0, admin: { description: 'Only if shown separately' } },
        { name: 'insurance', type: 'number', min: 0 },
        { name: 'discount', type: 'number', min: 0 },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'portOfLoading', type: 'text' },
        { name: 'portOfDischarge', type: 'text' },
        { name: 'shipmentBy', type: 'select', label: 'Shipment by', options: ['Sea', 'Air', 'Courier', 'Land'].map((v) => ({ label: v, value: v })) },
        { name: 'deliveryTime', type: 'text', admin: { description: 'e.g. 30 days after payment' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'vessel', type: 'text', label: 'Vessel / flight', admin: { description: 'Invoice and packing list' } },
        { name: 'blNumber', type: 'text', label: 'B/L or AWB no.' },
      ],
    },
    { name: 'shippingMarks', type: 'textarea', admin: { rows: 3 } },
    { name: 'remarks', type: 'textarea', label: 'Remarks printed on the documents', admin: { rows: 3 } },
    { name: 'order', type: 'relationship', relationTo: 'order-matches', label: 'Customer order', admin: { description: 'For our records only' } },
    { name: 'internalNotes', type: 'textarea', label: 'Internal notes (never printed)' },
    {
      type: 'collapsible',
      label: 'After the order: shipment and follow-up',
      admin: { initCollapsed: true },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'readyDate', type: 'date', label: 'Goods ready', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
            { name: 'etd', type: 'date', label: 'Departure (ETD)', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
            { name: 'eta', type: 'date', label: 'Arrival (ETA)', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
            { name: 'forwarder', type: 'text', label: 'Forwarder or courier' },
          ],
        },
        {
          name: 'documentsSent', type: 'select', hasMany: true, label: 'Documents sent to the client',
          options: ['Proforma invoice', 'Commercial invoice', 'Packing list', 'Certificate of analysis', 'Certificate of origin', 'B/L or AWB copy', 'Original documents by courier', 'Insurance certificate'].map((v) => ({ label: v, value: v })),
        },
        { name: 'followUp', type: 'textarea', label: 'Follow-up notes and client emails (complaints, feedback, next order)', admin: { rows: 3 } },
        { name: 'clientReplyAt', type: 'date', label: 'Last email from the client', hooks: { beforeDuplicate: [() => null] }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    // The key in the client's private document links (WhatsApp). Never shown or copied.
    { name: 'shareToken', type: 'text', unique: true, index: true, hooks: { beforeDuplicate: [() => null] }, admin: { hidden: true } },
    { name: 'shareCreatedAt', type: 'date', hooks: { beforeDuplicate: [() => null] }, admin: { hidden: true } },
    { name: 'sendLog', type: 'textarea', label: 'Sending history', access: { create: () => false, update: () => false }, admin: { readOnly: true, rows: 2 } },
    {
      type: 'collapsible',
      label: 'Payments and documents for this sale',
      admin: { initCollapsed: false },
      fields: [
        { name: 'payments', type: 'join', collection: 'payments', on: 'buyerDocument', admin: { defaultColumns: ['date', 'direction', 'amount', 'currency', 'reference'] } },
        { name: 'documents', type: 'join', collection: 'trade-files', on: 'buyerDocument', admin: { defaultColumns: ['filename', 'kind', 'date', 'title'] } },
      ],
    },
  ],
}
