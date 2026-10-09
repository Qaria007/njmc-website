import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'

import { buildTasks, type CertRow, clientReminder, type EnquiryRow, type OrderRow, priceHistory, type SaleRow, supplierReminder, supplierScores } from '../lib/desk.ts'
import { usdPerUnit } from '../lib/order-desk.ts'
import { emailsIn, money } from '../lib/trade-docs.ts'
import { loadOverview } from './Payments.ts'
import { CERT_TYPES } from './SupplierCertificates.ts'
import { jsonBody, notJson, quoteLink } from './SupplierOrders.ts'
import { loadSeller } from './TradeSettings.ts'

// The home dashboard's server side (signed-in admins only): today's tasks, search across everything,
// price history, supplier scores, the timeline of one order, and reminder emails (confirmed first).
type Doc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const idOf = (r: unknown) => (r && typeof r === 'object' ? String((r as Doc).id) : r == null ? null : String(r))
const nameOf = (r: unknown) => (r && typeof r === 'object' ? s((r as Doc).name ?? (r as Doc).title) : '')
const admin = (req: PayloadRequest) => req.user?.collection === 'users'
const denied = () => Response.json({ error: 'Not allowed' }, { status: 403 })
const q = (req: PayloadRequest, k: string) => s(((req.query ?? {}) as Record<string, unknown>)[k]).slice(0, 200)
const CERT_LABEL = new Map(CERT_TYPES.map((c) => [c.value, c.label]))

// Linked records come back with only the fields the dashboard shows (names, titles, statuses).
const POPULATE = { 'order-matches': { title: true, status: true }, suppliers: { name: true, contactPerson: true }, clients: { name: true }, 'supplier-orders': { number: true } }

async function find(req: PayloadRequest, collection: string, where?: object, depth = 1, select?: object) {
  const res = await req.payload.find({
    collection: collection as never, where: where as never, limit: 0, depth, pagination: false, overrideAccess: true, req, populate: POPULATE as never, joins: false as never,
    ...(select ? { select: select as never } : {}),
  })
  return res.docs as unknown as Doc[]
}

export async function loadEnquiries(req: PayloadRequest): Promise<EnquiryRow[]> {
  const docs = await find(req, 'supplier-orders', undefined, 1)
  return docs.map((e) => ({
    id: String(e.id), number: s(e.number), kind: e.kind as 'rfq' | 'po', status: s(e.status), supplierId: idOf(e.supplier) ?? '', supplier: nameOf(e.supplier), orderId: idOf(e.order), orderTitle: nameOf(e.order),
    orderStatus: e.order && typeof e.order === 'object' ? s((e.order as Doc).status) : '',
    date: s(e.date), sentAt: s(e.sentAt), quoteReceivedAt: s(e.quoteReceivedAt), quoteValidUntil: s(e.quoteValidUntil),
    currency: e.kind === 'po' ? s(e.currency) || 'USD' : s(e.quoteCurrency) || s(e.currency) || 'USD', fromEnquiry: idOf(e.fromEnquiry), items: (e.items as EnquiryRow['items']) ?? [],
  }))
}

async function loadSales(req: PayloadRequest, outstanding: Map<string, { outstandingUsd: number | null; committed: boolean }>): Promise<SaleRow[]> {
  const docs = await find(req, 'buyer-documents', undefined, 1)
  return docs.map((b) => ({
    id: String(b.id), number: s(b.piNumber), invoiceNumber: s(b.invoiceNumber), client: nameOf(b.client) || s(b.buyerName), status: s(b.status), piDate: s(b.piDate), validity: s(b.validity),
    eta: s(b.eta), etd: s(b.etd), readyDate: s(b.readyDate), orderId: idOf(b.order), currency: s(b.currency) || 'USD',
    outstandingUsd: outstanding.get(String(b.id))?.outstandingUsd ?? null, committed: outstanding.get(String(b.id))?.committed ?? false,
    items: ((b.items as Doc[]) ?? []).map((i) => ({ description: s(i.description), quantity: i.quantity as number | null, unit: s(i.unit), unitPrice: i.unitPrice as number | null, costPrice: i.costPrice as number | null, costSupplierId: idOf(i.costSupplier) })),
  }))
}

async function loadCerts(req: PayloadRequest): Promise<CertRow[]> {
  const docs = await find(req, 'supplier-certificates', undefined, 1)
  return docs.map((c) => ({ supplierId: idOf(c.supplier) ?? '', supplier: nameOf(c.supplier), type: CERT_LABEL.get(s(c.type)) ?? s(c.type), validUntil: s(c.validUntil) }))
}

const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`

const todayHandler: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const [overview, month, enquiries, certs, orderDocs] = await Promise.all([
    loadOverview(req, '', ''), loadOverview(req, monthStart(), new Date().toISOString().slice(0, 10)), loadEnquiries(req), loadCerts(req), find(req, 'order-matches', { status: { equals: 'new' } }, 1, { title: true, status: true, client: true, customer: true, createdAt: true }),
  ])
  const outstanding = new Map(overview.sales.map((x) => [x.id, { outstandingUsd: x.outstandingUsd, committed: x.committed }]))
  const sales = await loadSales(req, outstanding)
  // Certificates only of suppliers we dealt with in the last 6 months: the archive holds hundreds of old ones.
  const since = new Date(Date.now() - 183 * 86_400_000).toISOString()
  const active = new Set(enquiries.filter((e) => (e.date || e.sentAt) >= since).map((e) => e.supplierId))
  const orders: OrderRow[] = orderDocs.map((o) => ({ id: String(o.id), title: s(o.title), status: s(o.status), client: nameOf(o.client) || s(o.customer), createdAt: s(o.createdAt) }))
  const tasks = buildTasks({
    enquiries, sales, certs: certs.filter((c) => active.has(c.supplierId)), orders,
    poOwed: overview.purchases.map((p) => ({ id: p.id, number: p.number, supplier: p.supplier, owedUsd: p.owedUsd ?? 0, date: p.date })),
  })
  // Certificates of analysis received in the last 90 days and not yet checked with PharmaTrust.
  const coas = await req.payload.find({
    collection: 'trade-files', where: { and: [{ kind: { equals: 'coa' } }, { ptResult: { exists: false } }, { createdAt: { greater_than: new Date(Date.now() - 90 * 86_400_000).toISOString() } }] },
    sort: '-createdAt', limit: 30, depth: 1, overrideAccess: true, req, populate: POPULATE as never,
  })
  ;(tasks as Record<string, unknown>).coaChecks = (coas.docs as unknown as Doc[]).map((f) => ({
    kind: 'coa', title: `Check with PharmaTrust: ${s(f.title) || s(f.filename)}`, detail: nameOf(f.supplier), href: `/admin/collections/trade-files/${f.id}`,
    age: Math.round((Date.now() - Date.parse(s(f.createdAt))) / 86_400_000),
  }))
  // Emails about our documents that nobody marked done yet.
  const mails = await req.payload.find({ collection: 'inbox-messages', where: { done: { equals: false } }, sort: '-receivedAt', limit: 50, depth: 0, overrideAccess: true, req })
  ;(tasks as Record<string, unknown>).emails = (mails.docs as unknown as Doc[]).map((m) => ({
    kind: 'email', title: `${s(m.from).replace(/<.*>/, '').replace(/"/g, '').trim() || 'Email'} about ${s(m.docNumber)}`, detail: [s(m.subject).slice(0, 90), s(m.aiNote)].filter(Boolean).join('. '),
    href: idOf(m.supplierOrder) ? `/admin/collections/supplier-orders/${idOf(m.supplierOrder)}` : idOf(m.buyerDocument) ? `/admin/collections/buyer-documents/${idOf(m.buyerDocument)}` : `/admin/collections/inbox-messages/${m.id}`,
    age: Math.round((Date.now() - Date.parse(s(m.receivedAt))) / 86_400_000), done: String(m.id),
  }))
  return Response.json({ tasks, money: { month: month.totals, all: overview.totals, missingRates: overview.missingRates }, user: s(req.user?.email) })
}

// Search everything by name, number or CAS: clients, suppliers, orders, sales, enquiries, products.
const searchHandler: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const term = q(req, 'q').trim()
  if (term.length < 2) return Response.json({ results: [] })
  const like = { like: term }
  const sets: [string, string, object, (d: Doc) => string, (d: Doc) => string][] = [
    ['clients', 'Client', { or: [{ name: like }, { contactPerson: like }, { email: like }] }, (d) => s(d.name), (d) => s(d.country)],
    ['suppliers', 'Supplier', { or: [{ name: like }, { nameLocal: like }, { contactPerson: like }, { email: like }] }, (d) => s(d.name), (d) => [s(d.city), s(d.country)].filter(Boolean).join(', ')],
    ['order-matches', 'Customer order', { or: [{ title: like }, { customer: like }] }, (d) => s(d.title), (d) => s(d.status)],
    ['buyer-documents', 'Sale (PI / invoice)', { or: [{ piNumber: like }, { invoiceNumber: like }, { buyerName: like }, { 'items.description': like }] }, (d) => [s(d.piNumber), s(d.buyerName)].join(', '), (d) => s(d.status)],
    ['supplier-orders', 'Enquiry / purchase order', { or: [{ number: like }, { 'items.material': like }] }, (d) => s(d.number), (d) => s(d.status)],
    ['products', 'Product', { or: [{ name: like }, { cas: like }, { otherNames: like }] }, (d) => s(d.name), (d) => s(d.cas)],
  ]
  const results = await Promise.all(
    sets.map(async ([collection, label, where, title, detail]) => {
      const res = await req.payload.find({ collection: collection as never, where: where as never, limit: 6, depth: 0, overrideAccess: true, req })
      return (res.docs as unknown as Doc[]).map((d) => ({ type: label, title: title(d), detail: detail(d), href: `/admin/collections/${collection}/${d.id}` }))
    }),
  )
  return Response.json({ results: results.flat() })
}

const historyHandler: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const term = q(req, 'q').trim()
  if (term.length < 2) return Response.json({ points: [] })
  const [enquiries, seller] = await Promise.all([loadEnquiries(req), loadSeller(req.payload, req)])
  const sales = await loadSales(req, new Map())
  return Response.json({ points: priceHistory(term, enquiries, sales, seller.rates).slice(0, 200) })
}

// GET ?ids=1,2,3: the scorecard of these suppliers (or all with activity when no ids).
const scoresHandler: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const ids = new Set(q(req, 'ids').split(',').map((x) => x.trim()).filter(Boolean))
  const [enquiries, certs, seller] = await Promise.all([loadEnquiries(req), loadCerts(req), loadSeller(req.payload, req)])
  const all = supplierScores(enquiries, certs.filter((c) => !ids.size || ids.has(c.supplierId)), seller.rates)
  const scores = [...all.values()].filter((x) => (ids.size ? ids.has(x.supplierId) : x.enquiries + x.orders > 0))
  return Response.json({ scores })
}

// Everything that happened on one customer order, in date order.
const timelineHandler: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const id = q(req, 'id')
  if (!/^\d+$/.test(id)) return Response.json({ error: 'Unknown order' }, { status: 400 })
  const order = (await req.payload.findByID({ collection: 'order-matches', id, depth: 1, overrideAccess: true, req })) as unknown as Doc
  const [rfqs, sales, files, pays] = await Promise.all([
    find(req, 'supplier-orders', { order: { equals: id } }, 1), find(req, 'buyer-documents', { order: { equals: id } }, 0), find(req, 'trade-files', { order: { equals: id } }, 0), find(req, 'payments', { order: { equals: id } }, 1),
  ])
  type Ev = { date: string; text: string; href: string }
  const ev: Ev[] = [{ date: s(order.createdAt), text: `Order received${nameOf(order.client) ? ` from ${nameOf(order.client)}` : ''}`, href: `/admin/collections/order-matches/${id}` }]
  for (const e of rfqs) {
    const what = e.kind === 'po' ? 'Purchase order' : 'Enquiry'
    const href = `/admin/collections/supplier-orders/${e.id}`
    ev.push({ date: s(e.createdAt), text: `${what} ${s(e.number)} prepared for ${nameOf(e.supplier)}`, href })
    if (e.sentAt) ev.push({ date: s(e.sentAt), text: `${what} ${s(e.number)} sent to ${nameOf(e.supplier)}`, href })
    if (e.quoteReceivedAt) ev.push({ date: s(e.quoteReceivedAt), text: `Prices received from ${nameOf(e.supplier)}`, href })
  }
  for (const b of sales) {
    const href = `/admin/collections/buyer-documents/${b.id}`
    ev.push({ date: s(b.createdAt), text: `Proforma invoice ${s(b.piNumber)} made (${s(b.status)})`, href })
    for (const line of s(b.sendLog).split('\n').filter(Boolean)) ev.push({ date: `${line.slice(0, 10)}T${line.slice(11, 16)}:00.000Z`, text: line.replace(/^.*? UTC: /, ''), href })
    if (b.invoiceDate) ev.push({ date: s(b.invoiceDate), text: `Invoice ${s(b.invoiceNumber)} dated`, href })
    if (b.etd) ev.push({ date: s(b.etd), text: 'Shipment leaves', href })
    if (b.eta) ev.push({ date: s(b.eta), text: 'Shipment arrives', href })
  }
  for (const p of pays) {
    if (p.void) continue
    const what = p.direction === 'in' ? `Payment received from ${nameOf(p.client) || 'client'}` : p.direction === 'out' ? `Paid to ${nameOf(p.supplier) || 'supplier'}` : `Cost: ${s(p.category) || 'other'}`
    ev.push({ date: s(p.date), text: `${what}, ${s(p.currency)} ${money(Number(p.amount))}`, href: `/admin/collections/payments/${p.id}` })
  }
  for (const f of files) ev.push({ date: s(f.date) || s(f.createdAt), text: `Document: ${s(f.title) || s(f.filename)}`, href: `/admin/collections/trade-files/${f.id}` })
  return Response.json({ events: ev.filter((e) => e.date && !Number.isNaN(Date.parse(e.date))).sort((a, b) => a.date.localeCompare(b.date)) })
}

// The reminder draft for a supplier enquiry or a client sale.
async function reminderDraft(req: PayloadRequest, type: string, id: string) {
  if (!/^\d+$/.test(id)) return { error: 'Unknown record' }
  const seller = await loadSeller(req.payload, req)
  if (type === 'supplier') {
    const e = (await req.payload.findByID({ collection: 'supplier-orders', id, depth: 1, overrideAccess: true, req })) as unknown as Doc
    if (e.kind !== 'rfq' || !e.sentAt) return { error: 'Only a sent enquiry can be reminded' }
    const sup = (e.supplier && typeof e.supplier === 'object' ? e.supplier : {}) as Doc
    const m = supplierReminder({ number: s(e.number), contactPerson: s(sup.contactPerson), sentAt: s(e.sentAt), quoteLink: s(e.quoteToken) ? quoteLink(s(e.quoteToken)) : '' }, seller)
    return { to: emailsIn(e.toEmail), ...m, collection: 'supplier-orders' as const, doc: e }
  }
  if (type === 'client') {
    const b = (await req.payload.findByID({ collection: 'buyer-documents', id, depth: 0, overrideAccess: true, req })) as unknown as Doc
    const overview = await loadOverview(req, '', '')
    const row = overview.sales.find((x) => x.id === String(b.id))
    const committed = Boolean(row?.committed)
    // The open amount in the sale's own currency (the overview works in USD).
    const cur = s(b.currency) || 'USD'
    const perUnit = usdPerUnit(cur, seller.rates)
    const open = row?.outstandingUsd != null && perUnit ? row.outstandingUsd / perUnit : null
    if (committed && open == null) return { error: `No exchange rate for ${cur}: the open amount is unknown. Fill in the rates in Company details` }
    const m = clientReminder({ number: s(b.invoiceNumber) || s(b.piNumber), contact: s(b.buyerContact), outstanding: open != null ? money(Math.round(open * 100) / 100) : '', currency: cur, paid: committed }, seller)
    return { to: emailsIn(b.buyerEmail), ...m, collection: 'buyer-documents' as const, doc: b }
  }
  return { error: 'Unknown reminder' }
}

const remindPreview: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const d = await reminderDraft(req, q(req, 'type'), q(req, 'id'))
  if ('error' in d) return Response.json({ error: d.error }, { status: 400 })
  return Response.json({ to: d.to, subject: d.subject, body: d.body, you: s(req.user?.email) })
}

// POST { type, id, subject, body, confirm | test }
const remindSend: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const body = await jsonBody<{ type?: string; id?: string | number; subject?: string; body?: string; confirm?: boolean; test?: boolean }>(req)
  if (!body) return notJson()
  if (!body.confirm && !body.test) return Response.json({ error: 'Confirmation is required' }, { status: 400 })
  if (!process.env.SMTP_HOST && (body.confirm || process.env.NODE_ENV === 'production')) return Response.json({ error: 'Email is not set up on this server, nothing was sent' }, { status: 503 })
  const d = await reminderDraft(req, s(body.type), s(body.id))
  if ('error' in d) return Response.json({ error: d.error }, { status: 400 })
  const seller = await loadSeller(req.payload, req)
  const mail = {
    from: `"${seller.companyName.replace(/["\\\r\n]/g, '')}" <${process.env.MAIL_FROM || 'sale@njmcmedicsupp.com'}>`, replyTo: emailsIn(seller.email)[0],
    subject: s(body.subject).trim().slice(0, 300) || d.subject, text: s(body.body).trim().slice(0, 20000) || d.body,
  }
  try {
    if (body.test) {
      const me = emailsIn(req.user?.email)
      await req.payload.sendEmail({ ...mail, to: me, subject: `[TEST] ${mail.subject}` })
      return Response.json({ ok: true, test: true, to: me })
    }
    if (!d.to.length) return Response.json({ error: 'No email address on this record' }, { status: 400 })
    const cc = emailsIn(seller.copyTo).filter((e) => !d.to.includes(e))
    await req.payload.sendEmail({ ...mail, to: d.to, ...(cc.length ? { cc } : {}) })
  } catch (err) {
    req.payload.logger.error({ name: (err as Error)?.name }, 'reminder failed')
    return Response.json({ error: 'The email could not be sent' }, { status: 502 })
  }
  const now = new Date().toISOString()
  const log = `${now.slice(0, 16).replace('T', ' ')} UTC: reminder sent to ${d.to.join(', ')} by ${s(req.user?.email)}`
  try {
    await req.payload.update({ collection: d.collection, id: d.doc.id, depth: 0, overrideAccess: true, req, data: { sendLog: [s(d.doc.sendLog), log].filter(Boolean).join('\n') } as never })
  } catch {
    return Response.json({ ok: true, to: d.to, warning: 'The reminder WAS sent, but it could not be logged on the record.' })
  }
  return Response.json({ ok: true, to: d.to })
}

// POST { id }: mark an email received as handled.
const emailDone: PayloadHandler = async (req) => {
  if (!admin(req)) return denied()
  const body = await jsonBody<{ id?: string }>(req)
  if (!body || !/^\d+$/.test(s(body.id))) return notJson()
  await req.payload.update({ collection: 'inbox-messages', id: s(body.id), depth: 0, overrideAccess: true, req, data: { done: true } as never })
  return Response.json({ ok: true })
}

export const deskEndpoints: Endpoint[] = [
  { path: '/desk/today', method: 'get', handler: todayHandler },
  { path: '/desk/search', method: 'get', handler: searchHandler },
  { path: '/desk/price-history', method: 'get', handler: historyHandler },
  { path: '/desk/scores', method: 'get', handler: scoresHandler },
  { path: '/desk/order-timeline', method: 'get', handler: timelineHandler },
  { path: '/desk/remind', method: 'get', handler: remindPreview },
  { path: '/desk/remind', method: 'post', handler: remindSend },
  { path: '/desk/email-done', method: 'post', handler: emailDone },
]
