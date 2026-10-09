// The home dashboard: what needs action today, price history per material, and the supplier
// scorecard. Pure functions over plain rows (no Payload, no I/O) so they can be tested.

import { convert, type Rates } from './order-desk.ts'

const t = (v: unknown) => (v == null ? '' : String(v).trim())
const day = (v: unknown) => t(v).slice(0, 10)
const DAY = 86_400_000
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY)

// ---------- Rows the endpoints load ----------

export type EnquiryRow = {
  id: string; number: string; kind: 'rfq' | 'po'; status: string; supplierId: string; supplier: string; orderId: string | null; orderTitle: string; orderStatus?: string
  date: string; sentAt: string; quoteReceivedAt: string; quoteValidUntil: string; currency: string; fromEnquiry: string | null
  items: { material: string; requested?: string | null; quantity?: number | null; unit?: string | null; quotedPrice?: number | null; unitPrice?: number | null }[]
}
export type SaleRow = {
  id: string; number: string; invoiceNumber: string; client: string; status: string; piDate: string; validity: string; eta: string; etd: string; readyDate: string
  orderId: string | null; currency: string; outstandingUsd: number | null; committed: boolean
  items: { description: string; quantity?: number | null; unit?: string | null; unitPrice?: number | null; costPrice?: number | null; costSupplierId?: string | null }[]
}
export type CertRow = { supplierId: string; supplier: string; type: string; validUntil: string }
export type OrderRow = { id: string; title: string; status: string; client: string; createdAt: string }

export type Task = { kind: string; title: string; detail: string; href: string; age?: number; due?: string; action?: { type: 'remind-supplier' | 'remind-client'; id: string } }
export type Tasks = { overdueReplies: Task[]; pricesToUse: Task[]; waitingClient: Task[]; paymentsDue: Task[]; supplierPayments: Task[]; shipments: Task[]; expiringQuotes: Task[]; certificates: Task[]; newOrders: Task[] }

// What needs doing, oldest first in each list. `replyDays` is how long a supplier may take before
// a reminder is suggested.
export function buildTasks(
  input: { enquiries: EnquiryRow[]; sales: SaleRow[]; certs: CertRow[]; orders: OrderRow[]; poOwed: { id: string; number: string; supplier: string; owedUsd: number; date: string }[] },
  now = new Date().toISOString(),
  replyDays = 3,
): Tasks {
  const today = day(now)
  // Enquiries of orders that are won or lost need nothing more.
  const rfqs = input.enquiries.filter((e) => e.kind === 'rfq' && e.status !== 'cancelled' && !['won', 'lost'].includes(e.orderStatus ?? ''))
  const poFrom = new Set(input.enquiries.filter((e) => e.kind === 'po' && e.status !== 'cancelled' && e.fromEnquiry).map((e) => e.fromEnquiry as string))
  const ordersWithSale = new Set(input.sales.filter((s) => s.status !== 'cancelled' && s.orderId).map((s) => s.orderId as string))
  const ordersWithPo = new Set(input.enquiries.filter((e) => e.kind === 'po' && e.status !== 'cancelled' && e.orderId).map((e) => e.orderId as string))
  const by = <T extends Task>(xs: T[]) => xs.sort((a, b) => (b.age ?? 0) - (a.age ?? 0))

  const overdueReplies = by(
    rfqs
      .filter((e) => e.sentAt && !e.quoteReceivedAt && daysBetween(e.sentAt, now) >= replyDays)
      .map((e) => ({
        kind: 'reply', title: `${e.supplier} has not answered ${e.number}`, detail: e.orderTitle ? `Order: ${e.orderTitle}` : '', href: `/admin/collections/supplier-orders/${e.id}`,
        age: daysBetween(e.sentAt, now), action: { type: 'remind-supplier' as const, id: e.id },
      })),
  )
  // Prices in, but no PI made for the order yet and no purchase order from this enquiry.
  const pricesToUse = by(
    rfqs
      .filter((e) => e.quoteReceivedAt && !poFrom.has(e.id) && !(e.orderId && (ordersWithSale.has(e.orderId) || ordersWithPo.has(e.orderId))))
      .map((e) => ({
        kind: 'prices', title: `Prices from ${e.supplier} (${e.number})`, detail: e.orderTitle ? `Compare and make the PI on: ${e.orderTitle}` : 'Open the enquiry',
        href: e.orderId ? `/admin/collections/order-matches/${e.orderId}` : `/admin/collections/supplier-orders/${e.id}`, age: daysBetween(e.quoteReceivedAt, now),
      })),
  )
  const waitingClient = by(
    input.sales
      .filter((s) => s.status === 'PI sent')
      .map((s) => ({
        kind: 'client', title: `${s.client}: ${s.number} sent, no confirmation`, detail: s.validity ? `Valid until ${day(s.validity)}` : '', href: `/admin/collections/buyer-documents/${s.id}`,
        age: daysBetween(s.piDate || now, now), due: day(s.validity), action: { type: 'remind-client' as const, id: s.id },
      })),
  )
  const paymentsDue = by(
    input.sales
      .filter((s) => s.committed && (s.outstandingUsd ?? 0) > 0.005)
      .map((s) => ({
        kind: 'payment', title: `${s.client} owes USD ${(s.outstandingUsd ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        detail: s.invoiceNumber || s.number, href: `/admin/collections/buyer-documents/${s.id}`, age: daysBetween(s.piDate || now, now), action: { type: 'remind-client' as const, id: s.id },
      })),
  )
  const supplierPayments = by(
    input.poOwed
      .filter((p) => p.owedUsd > 0.005)
      .map((p) => ({ kind: 'pay', title: `We owe ${p.supplier} USD ${p.owedUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, detail: p.number, href: `/admin/collections/supplier-orders/${p.id}`, age: daysBetween(p.date || now, now) })),
  )
  // Goods ready, leaving or arriving within 14 days (or already past and not delivered).
  const soon = (d: string) => d && daysBetween(today, d) <= 14
  const shipments = input.sales
    .filter((s) => !['draft', 'delivered', 'closed', 'cancelled'].includes(s.status) && (soon(day(s.eta)) || soon(day(s.etd)) || soon(day(s.readyDate))))
    .map((s) => {
      // The earliest date that falls in the window is the one to act on.
      const [label, d] = ([['ready', day(s.readyDate)], ['leaves', day(s.etd)], ['arrives', day(s.eta)]] as [string, string][]).filter(([, x]) => soon(x)).sort((a, b) => a[1].localeCompare(b[1]))[0]
      return { kind: 'ship', title: `${s.client}: ${s.invoiceNumber || s.number} ${label} ${d}`, detail: d < today ? 'Date passed: update the shipment' : '', href: `/admin/collections/buyer-documents/${s.id}`, due: d }
    })
    .sort((a, b) => a.due.localeCompare(b.due))
  const expiringQuotes = rfqs
    .filter((e) => {
      if (!e.quoteValidUntil || poFrom.has(e.id) || (e.orderId && (ordersWithSale.has(e.orderId) || ordersWithPo.has(e.orderId)))) return false
      const left = daysBetween(today, day(e.quoteValidUntil))
      return left <= 7 && left >= -14
    })
    .map((e) => {
      const d = day(e.quoteValidUntil)
      return { kind: 'quote', title: `${e.supplier} prices ${d < today ? 'expired' : 'expire'} ${d}`, detail: e.number, href: `/admin/collections/supplier-orders/${e.id}`, due: d }
    })
    .sort((a, b) => a.due.localeCompare(b.due))
  const certificates = input.certs
    .filter((c) => c.validUntil && daysBetween(today, day(c.validUntil)) <= 60 && daysBetween(today, day(c.validUntil)) >= -90)
    .map((c) => {
      const d = day(c.validUntil)
      return { kind: 'cert', title: `${c.supplier}: ${c.type} ${d < today ? 'expired' : 'expires'} ${d}`, detail: 'Ask the supplier for the renewed certificate', href: `/admin/collections/suppliers/${c.supplierId}`, due: d }
    })
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 30)
  const newOrders = by(
    input.orders
      .filter((o) => o.status === 'new')
      .map((o) => ({ kind: 'order', title: `New order: ${o.title}`, detail: o.client ? `Client: ${o.client}. Message the suppliers` : 'Message the suppliers', href: `/admin/collections/order-matches/${o.id}`, age: daysBetween(o.createdAt, now) })),
  )
  return { overdueReplies, pricesToUse, waitingClient, paymentsDue, supplierPayments, shipments, expiringQuotes, certificates, newOrders }
}

// ---------- Price history ----------

export type PricePoint = { date: string; kind: 'quoted' | 'bought' | 'sold'; party: string; partyId: string; material: string; price: number; currency: string; usd: number | null; unit: string; ref: string; href: string }

const norm = (v: unknown) => t(v).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Does a line name the material asked for? Every word of the query must appear in the line.
export function namesMaterial(line: string, query: string): boolean {
  const q = norm(query).split(' ').filter(Boolean)
  const l = ` ${norm(line)} `
  return q.length > 0 && q.every((w) => l.includes(` ${w} `) || (w.length >= 4 && l.includes(w)))
}

// Every quoted, bought and sold price of a material, newest first, with a USD value to compare.
export function priceHistory(query: string, enquiries: EnquiryRow[], sales: SaleRow[], rates: Rates): PricePoint[] {
  const out: PricePoint[] = []
  for (const e of enquiries) {
    if (e.status === 'cancelled') continue
    for (const i of e.items) {
      if (![i.material, i.requested].some((n) => namesMaterial(t(n), query))) continue
      const price = e.kind === 'po' ? i.unitPrice : i.quotedPrice
      if (price == null || !(price > 0)) continue
      out.push({
        date: day(e.kind === 'po' ? e.date : e.quoteReceivedAt || e.date), kind: e.kind === 'po' ? 'bought' : 'quoted', party: e.supplier, partyId: e.supplierId, material: i.material,
        price, currency: e.currency || 'USD', usd: convert(price, e.currency || 'USD', 'USD', rates), unit: t(i.unit) || 'kg', ref: e.number, href: `/admin/collections/supplier-orders/${e.id}`,
      })
    }
  }
  for (const s of sales) {
    if (s.status === 'cancelled' || s.status === 'draft') continue
    for (const i of s.items) {
      if (!namesMaterial(i.description, query) || i.unitPrice == null || !(i.unitPrice > 0)) continue
      out.push({
        date: day(s.piDate), kind: 'sold', party: s.client, partyId: '', material: i.description, price: i.unitPrice, currency: s.currency || 'USD',
        usd: convert(i.unitPrice, s.currency || 'USD', 'USD', rates), unit: t(i.unit) || 'kg', ref: s.invoiceNumber || s.number, href: `/admin/collections/buyer-documents/${s.id}`,
      })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

// ---------- Supplier scorecard ----------

export type Score = {
  supplierId: string; enquiries: number; answered: number; answerRate: number | null; avgReplyDays: number | null
  pricedLines: number; cheapestLines: number; cheapestRate: number | null; orders: number; certificates: { valid: number; expiring: number; expired: number }
}

// How a supplier behaves with us: how often and how fast they answer, how often their price was the
// lowest on an order line, how many purchase orders they got, and their certificate state.
export function supplierScores(enquiries: EnquiryRow[], certs: CertRow[], rates: Rates, now = new Date().toISOString()): Map<string, Score> {
  const m = new Map<string, Score>()
  const get = (id: string) => {
    let s = m.get(id)
    if (!s) {
      s = { supplierId: id, enquiries: 0, answered: 0, answerRate: null, avgReplyDays: null, pricedLines: 0, cheapestLines: 0, cheapestRate: null, orders: 0, certificates: { valid: 0, expiring: 0, expired: 0 } }
      m.set(id, s)
    }
    return s
  }
  const replyDays = new Map<string, number[]>()
  // Lowest USD price per order line (order + requested wording).
  const lines = new Map<string, { supplierId: string; usd: number }[]>()
  for (const e of enquiries) {
    if (e.status === 'cancelled') continue
    const s = get(e.supplierId)
    if (e.kind === 'po') {
      s.orders++
      continue
    }
    // Sent by email, or answered through a link passed on by WeChat or phone.
    if (!e.sentAt && !e.quoteReceivedAt) continue
    s.enquiries++
    if (e.quoteReceivedAt) s.answered++
    if (e.quoteReceivedAt && e.sentAt) {
      replyDays.set(e.supplierId, [...(replyDays.get(e.supplierId) ?? []), Math.max(0, (Date.parse(e.quoteReceivedAt) - Date.parse(e.sentAt)) / DAY)])
    }
    if (!e.orderId) continue
    for (const i of e.items) {
      const usd = convert(i.quotedPrice ?? null, e.currency || 'USD', 'USD', rates)
      if (usd == null || !(usd > 0)) continue
      s.pricedLines++
      const k = `${e.orderId}|${norm(i.requested || i.material)}`
      lines.set(k, [...(lines.get(k) ?? []), { supplierId: e.supplierId, usd }])
    }
  }
  for (const offers of lines.values()) {
    if (offers.length < 2) continue
    const low = Math.min(...offers.map((o) => o.usd))
    for (const sup of new Set(offers.filter((o) => o.usd === low).map((o) => o.supplierId))) get(sup).cheapestLines++
  }
  const today = day(now)
  for (const c of certs) {
    const s = get(c.supplierId)
    const d = day(c.validUntil)
    if (!d) s.certificates.valid++
    else if (d < today) s.certificates.expired++
    else if (daysBetween(today, d) <= 60) s.certificates.expiring++
    else s.certificates.valid++
  }
  for (const s of m.values()) {
    s.answerRate = s.enquiries ? Math.round((s.answered / s.enquiries) * 100) : null
    const r = replyDays.get(s.supplierId)
    s.avgReplyDays = r?.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 10) / 10 : null
    const compared = [...lines.values()].filter((o) => o.length >= 2 && o.some((x) => x.supplierId === s.supplierId)).length
    s.cheapestRate = compared ? Math.round((s.cheapestLines / compared) * 100) : null
  }
  return m
}

// ---------- Reminders ----------

export function supplierReminder(d: { number: string; contactPerson?: string | null; sentAt: string; quoteLink?: string | null }, seller: { companyName: string; signatoryName?: string | null; email?: string | null; phone?: string | null }) {
  const greeting = `Dear ${t(d.contactPerson).split(/[,(]/)[0].trim() || 'Sir or Madam'},`
  const sign = [t(seller.signatoryName), seller.companyName, t(seller.email), t(seller.phone)].filter(Boolean).join('\n')
  return {
    subject: `Reminder: enquiry ${d.number} (${seller.companyName})`,
    body: [
      greeting,
      `We sent you our enquiry ${d.number} on ${day(d.sentAt)} and would be glad to have your quotation.`,
      d.quoteLink ? `You can enter your prices here (no login needed):\n${t(d.quoteLink)}` : 'Please reply to this email with your prices.',
      'If you cannot supply these items, a short reply saying so also helps us.',
      `Best regards,\n${sign}`,
    ].join('\n\n'),
  }
}

export function clientReminder(d: { number: string; contact?: string | null; outstanding?: string | null; currency?: string | null; paid: boolean }, seller: { companyName: string; signatoryName?: string | null; email?: string | null; phone?: string | null }) {
  const greeting = `Dear ${t(d.contact).split(/[,(]/)[0].trim() || 'Sir or Madam'},`
  const sign = [t(seller.signatoryName), seller.companyName, t(seller.email), t(seller.phone)].filter(Boolean).join('\n')
  return {
    subject: `${d.paid ? 'Payment reminder' : 'Follow-up'}: ${d.number} (${seller.companyName})`,
    body: [
      greeting,
      d.paid
        ? `This is a friendly reminder that ${t(d.currency) || 'USD'} ${t(d.outstanding)} is still open on ${d.number}. Please send the payment slip once the transfer is made. If it is already paid, thank you, and please ignore this message.`
        : `We sent you our proforma invoice ${d.number} and would like to know if you wish to go ahead. Prices from our suppliers are valid for a limited time, so an early confirmation helps us keep them.`,
      `Best regards,\n${sign}`,
    ].join('\n\n'),
  }
}
