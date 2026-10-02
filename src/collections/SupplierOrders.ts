import type { CollectionBeforeChangeHook, CollectionConfig, Payload, PayloadHandler, PayloadRequest } from 'payload'

import { BLOCKS_SENDING, docNumber, emailsIn, nextSeq, safeFileName, supplierMessage, type SupplierOrderDoc, supplierOrderGaps, type SupplierOrderItem, type SupplierOrderKind, supplierOrderSpec } from '../lib/trade-docs.ts'
import { renderPdf } from '../lib/trade-pdf.ts'
import { signedIn } from './access.ts'
import { loadSeller } from './TradeSettings.ts'

type AnyDoc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const idOf = (r: unknown) => (r && typeof r === 'object' ? (r as AnyDoc).id : (r as number | string))
const today = () => new Date().toISOString().slice(0, 10)
const admin = (req: PayloadRequest) => req.user?.collection === 'users'
const denied = () => Response.json({ error: 'Not allowed' }, { status: 403 })

// POST bodies must be JSON sent as JSON: a form or text/plain post from another page is refused.
export async function jsonBody<T>(req: PayloadRequest): Promise<T | null> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) return null
  try {
    return ((await req.json?.()) ?? {}) as T
  } catch {
    return null
  }
}
export const notJson = () => Response.json({ error: 'Send the request as JSON' }, { status: 415 })

export const INCOTERMS = ['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP']
export const CURRENCIES = ['USD', 'CNY', 'EUR']

export async function nextNumber(payload: Payload, collection: 'supplier-orders' | 'buyer-documents', field: string, prefix: 'RFQ' | 'PO' | 'PI' | 'INV', req?: PayloadRequest): Promise<string> {
  const year = new Date().getUTCFullYear()
  const res = await payload.find({ collection, where: { [field]: { like: `NJMC-${prefix}-${year}-` } }, limit: 5000, depth: 0, pagination: false, overrideAccess: true, req })
  return docNumber(prefix, year, nextSeq((res.docs as unknown as AnyDoc[]).map((d) => s(d[field])), prefix, year))
}

// The stored record plus the supplier's current details, in the shape trade-docs.ts works with.
function toDoc(d: Record<string, unknown>, supplier: AnyDoc | undefined): SupplierOrderDoc {
  return {
    kind: d.kind as SupplierOrderKind,
    number: s(d.number),
    date: s(d.date).slice(0, 10) || today(),
    supplierName: s(supplier?.name),
    supplierAddress: [s(supplier?.address), s(supplier?.city), s(supplier?.country)].filter(Boolean).join(', '),
    contactPerson: s(supplier?.contactPerson),
    supplierSource: s(supplier?.source),
    items: ((d.items as SupplierOrderItem[]) ?? []).map((i) => ({ ...i })),
    currency: s(d.currency),
    incoterm: s(d.incoterm),
    incotermPlace: s(d.incotermPlace),
    paymentTerms: s(d.paymentTerms),
    delivery: s(d.delivery),
    destination: s(d.destination),
    documentsRequired: s(d.documentsRequired),
    notes: s(d.notes),
  }
}

async function load(req: PayloadRequest) {
  const doc = (await req.payload.findByID({ collection: 'supplier-orders', id: s(req.routeParams?.id), depth: 1, overrideAccess: true, req })) as unknown as AnyDoc
  const supplier = doc.supplier && typeof doc.supplier === 'object' ? (doc.supplier as AnyDoc) : undefined
  const seller = await loadSeller(req.payload, req)
  const data = toDoc(doc, supplier)
  const to = emailsIn(doc.toEmail)
  const gaps = supplierOrderGaps(data, to)
  if (s(doc.message).trim() !== s(doc.messageAuto).trim()) gaps.push('the email message was edited by hand: check that it still matches the items, or tick "Write the message again" and save')
  return { doc, supplier, seller, data, to, gaps }
}

// Number, recipients and the message are filled in when the record is first saved; the message is
// written again whenever "Write the message again" is ticked.
const prepare: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  const kind = (data.kind ?? originalDoc?.kind ?? 'rfq') as SupplierOrderKind
  if (operation === 'create' || !s(data.number ?? originalDoc?.number)) data.number = await nextNumber(req.payload, 'supplier-orders', 'number', kind === 'po' ? 'PO' : 'RFQ', req)
  if (!data.date && !originalDoc?.date) data.date = new Date().toISOString()
  const supplierId = idOf(data.supplier ?? originalDoc?.supplier)
  const supplier = supplierId ? ((await req.payload.findByID({ collection: 'suppliers', id: supplierId, depth: 0, overrideAccess: true, req })) as unknown as AnyDoc) : undefined
  if (operation === 'create' && !s(data.toEmail)) data.toEmail = emailsIn(supplier?.email).join(', ')
  // The message follows the items and terms for as long as nobody edited it by hand
  // (messageAuto = the text as last written here). A hand-edited message is kept; /check then
  // says that it may no longer match.
  const merged = { ...originalDoc, ...data }
  const m = supplierMessage(toDoc(merged, supplier), await loadSeller(req.payload, req))
  const untouched = s(merged.message).trim() === s(originalDoc?.messageAuto).trim() && s(merged.subject).trim() === s(originalDoc?.subjectAuto).trim()
  if (data.rewriteMessage || !s(merged.subject) || !s(merged.message) || untouched) {
    data.subject = m.subject
    data.message = m.body
  }
  data.subjectAuto = m.subject
  data.messageAuto = m.body
  data.rewriteMessage = false
  return data
}

const pdfEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const { data, seller } = await load(req)
  const spec = supplierOrderSpec(data, seller)
  return new Response(Buffer.from(await renderPdf(spec)), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${safeFileName(spec.fileName)}"`, 'Cache-Control': 'no-store' },
  })
}

// What the confirmation step shows before anything is sent.
const checkEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const { doc, supplier, to, gaps, seller } = await load(req)
  return Response.json({
    number: doc.number, kind: doc.kind, status: doc.status, supplier: s(supplier?.name), to, copyTo: emailsIn(seller.copyTo), gaps, subject: doc.subject, message: doc.message,
    sentAt: doc.sentAt ?? null, phone: s(supplier?.phone), wechat: s(supplier?.wechat), you: s(req.user?.email),
  })
}

// POST { confirm: true } sends the message with the PDF to the supplier; { test: true } sends the
// same message only to the signed-in user. A sent order is not sent twice unless { again: true }.
const sendEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const body = await jsonBody<{ confirm?: boolean; test?: boolean; again?: boolean }>(req)
  if (!body) return notJson()
  if (!body.confirm && !body.test) return Response.json({ error: 'Confirmation is required' }, { status: 400 })
  // Without SMTP (local development) Payload only logs the mail: a real send is refused so that
  // nothing is ever recorded as sent when it was not. A test still runs (it is logged).
  if (!process.env.SMTP_HOST && (body.confirm || process.env.NODE_ENV === 'production')) return Response.json({ error: 'Email is not set up on this server, nothing was sent' }, { status: 503 })
  const { doc, data, seller, to, gaps } = await load(req)
  if (doc.status === 'cancelled') return Response.json({ error: 'This order is cancelled' }, { status: 400 })
  const from = `"${seller.companyName.replace(/["\\\r\n]/g, '')}" <${process.env.MAIL_FROM || 'sale@njmcmedicsupp.com'}>`
  const spec = supplierOrderSpec(data, seller)
  const mail = {
    from,
    replyTo: emailsIn(seller.email)[0],
    subject: s(doc.subject),
    text: s(doc.message),
    attachments: [{ filename: safeFileName(spec.fileName), content: Buffer.from(await renderPdf(spec)), contentType: 'application/pdf' }],
  }
  const failed = (err: unknown) => {
    req.payload.logger.error({ err }, 'supplier message failed')
    return Response.json({ error: `The email could not be sent: ${(err as Error).message}`.slice(0, 300) }, { status: 502 })
  }
  if (body.test) {
    const me = emailsIn(req.user?.email)
    if (!me.length) return Response.json({ error: 'Your login has no email address' }, { status: 400 })
    try {
      await req.payload.sendEmail({ ...mail, to: me, subject: `[TEST, not sent to the supplier] ${mail.subject}` })
    } catch (err) {
      return failed(err)
    }
    return Response.json({ ok: true, test: true, to: me })
  }
  const blocking = gaps.filter((g) => BLOCKS_SENDING.test(g))
  if (blocking.length) return Response.json({ error: `Not sent: ${blocking.join('; ')}` }, { status: 400 })
  if (doc.sentAt && !body.again) return Response.json({ error: `Already sent on ${s(doc.sentAt).slice(0, 10)}` }, { status: 409 })
  const cc = emailsIn(seller.copyTo).filter((e) => !to.includes(e))
  try {
    await req.payload.sendEmail({ ...mail, to, ...(cc.length ? { cc } : {}) })
  } catch (err) {
    return failed(err)
  }
  // The email is out. From here on a failure must never read as "not sent" (that invites a second send).
  const now = new Date().toISOString()
  const log = `${now.slice(0, 16).replace('T', ' ')} UTC: sent to ${to.join(', ')}${cc.length ? `, copy to ${cc.join(', ')}` : ''} by ${s(req.user?.email)}`
  let warning = ''
  try {
    await req.payload.update({
      collection: 'supplier-orders', id: doc.id, depth: 0, overrideAccess: true, req,
      data: { status: doc.status === 'draft' ? 'sent' : doc.status, sentAt: now, sentTo: to.join(', '), sendLog: [s(doc.sendLog), log].filter(Boolean).join('\n') } as never,
    })
    const orderId = idOf(doc.order)
    if (orderId) {
      const order = (await req.payload.findByID({ collection: 'order-matches', id: orderId, depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
      if (order.status === 'new') await req.payload.update({ collection: 'order-matches', id: orderId, depth: 0, overrideAccess: true, req, data: { status: 'suppliers contacted' } as never })
    }
  } catch (err) {
    req.payload.logger.error({ err }, `supplier message ${s(doc.number)} was sent but the record could not be updated`)
    warning = 'The email WAS sent, but the record could not be marked as sent. Do not send it again.'
  }
  return Response.json({ ok: true, to, cc, ...(warning ? { warning } : {}) })
}

// POST: a new purchase order with the same supplier and items as this enquiry, prices to fill in.
const toPoEndpoint: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  if (!(await jsonBody(req))) return notJson()
  const { doc } = await load(req)
  if (doc.kind !== 'rfq') return Response.json({ error: 'This is already a purchase order' }, { status: 400 })
  const seller = await loadSeller(req.payload, req)
  const po = await req.payload.create({
    collection: 'supplier-orders', depth: 0, overrideAccess: true, req,
    data: {
      kind: 'po', status: 'draft', supplier: idOf(doc.supplier), order: idOf(doc.order) ?? undefined, fromEnquiry: doc.id, toEmail: doc.toEmail,
      items: ((doc.items as SupplierOrderItem[]) ?? []).map((i) => ({ material: i.material, supplierProduct: i.supplierProduct, spec: i.spec, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice, note: i.note })),
      currency: doc.currency || 'USD', incoterm: doc.incoterm, incotermPlace: doc.incotermPlace, paymentTerms: s(doc.paymentTerms) || seller.supplierPaymentTerms, delivery: doc.delivery,
      destination: doc.destination, documentsRequired: seller.documentsRequired, notes: doc.notes,
    } as never,
  })
  return Response.json({ id: po.id, number: (po as unknown as AnyDoc).number })
}

// Enquiries (RFQ) and purchase orders (PO) to suppliers. Private: supplier names, prices.
export const SupplierOrders: CollectionConfig = {
  slug: 'supplier-orders',
  labels: { singular: 'Supplier enquiry or purchase order', plural: 'Supplier enquiries and purchase orders' },
  admin: {
    group: 'Orders',
    useAsTitle: 'number',
    defaultColumns: ['number', 'kind', 'supplier', 'status', 'sentAt'],
    description: 'An enquiry asks a supplier for prices. A purchase order orders the goods. Each one has a PDF and a message that is sent to the supplier only after you confirm.',
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  hooks: { beforeChange: [prepare] },
  endpoints: [
    { path: '/:id/pdf', method: 'get', handler: pdfEndpoint },
    { path: '/:id/check', method: 'get', handler: checkEndpoint },
    { path: '/:id/send', method: 'post', handler: sendEndpoint },
    { path: '/:id/to-po', method: 'post', handler: toPoEndpoint },
  ],
  timestamps: true,
  fields: [
    { name: 'actions', type: 'ui', admin: { components: { Field: '/components/admin/SupplierOrderActions#SupplierOrderActions' } } },
    {
      type: 'row',
      fields: [
        { name: 'number', type: 'text', unique: true, index: true, access: { update: () => false }, admin: { readOnly: true, description: 'Given automatically' } },
        {
          name: 'kind', type: 'select', required: true, defaultValue: 'rfq',
          options: [{ label: 'Enquiry (ask for prices)', value: 'rfq' }, { label: 'Purchase order', value: 'po' }],
          access: { update: () => false },
        },
        {
          name: 'status', type: 'select', defaultValue: 'draft',
          options: ['draft', 'sent', 'supplier replied', 'confirmed', 'cancelled'].map((v) => ({ label: v, value: v })),
        },
        { name: 'date', type: 'date', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'supplier', type: 'relationship', relationTo: 'suppliers', required: true },
        { name: 'toEmail', type: 'text', label: 'Send to (email)', admin: { description: 'Taken from the supplier record; change it here if needed. Several addresses: separate with commas.' } },
      ],
    },
    {
      name: 'items', type: 'array', labels: { singular: 'Item', plural: 'Items' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'material', type: 'text', required: true },
            { name: 'spec', type: 'text', label: 'Grade / specification' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'quantity', type: 'number', min: 0 },
            { name: 'unit', type: 'text', defaultValue: 'kg' },
            { name: 'unitPrice', type: 'number', min: 0, label: 'Unit price', admin: { description: 'Needed for a purchase order' } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'supplierProduct', type: 'text', label: 'Listed by the supplier as' },
            { name: 'note', type: 'text' },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'currency', type: 'select', defaultValue: 'USD', options: CURRENCIES.map((v) => ({ label: v, value: v })) },
        { name: 'incoterm', type: 'select', label: 'Price basis', options: INCOTERMS.map((v) => ({ label: v, value: v })) },
        { name: 'incotermPlace', type: 'text', label: 'Port or place', admin: { description: 'e.g. Shanghai' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'paymentTerms', type: 'text', admin: { description: 'e.g. 30% T/T in advance, 70% before shipment' } },
        { name: 'delivery', type: 'text', admin: { description: 'e.g. within 20 days of the order' } },
        { name: 'destination', type: 'text', admin: { description: 'Country or port. The customer name is never sent to suppliers.' } },
      ],
    },
    { name: 'documentsRequired', type: 'textarea', label: 'Documents required with the goods (purchase order)' },
    { name: 'notes', type: 'textarea', label: 'Notes printed on the document' },
    { name: 'subject', type: 'text', label: 'Email subject' },
    { name: 'message', type: 'textarea', label: 'Email message', admin: { rows: 14, description: 'Written automatically. You can edit it before sending.' } },
    { name: 'rewriteMessage', type: 'checkbox', label: 'Write the message again from the items when I save', defaultValue: false },
    // The subject and message as last written automatically: tells a hand-edited message apart.
    { name: 'subjectAuto', type: 'text', access: { create: () => false, update: () => false }, admin: { hidden: true } },
    { name: 'messageAuto', type: 'textarea', access: { create: () => false, update: () => false }, admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        { name: 'order', type: 'relationship', relationTo: 'order-matches', label: 'Customer order', admin: { description: 'For our records only' } },
        { name: 'fromEnquiry', type: 'relationship', relationTo: 'supplier-orders', label: 'Made from enquiry', admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'sentAt', type: 'date', access: { create: () => false, update: () => false }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'sentTo', type: 'text', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
      ],
    },
    { name: 'sendLog', type: 'textarea', label: 'Sending history', access: { create: () => false, update: () => false }, admin: { readOnly: true, rows: 2 } },
    { name: 'supplierReply', type: 'textarea', label: 'What the supplier answered (prices, lead time)' },
  ],
}
