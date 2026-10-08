// Order desk: supplier quotations, the selling price with our margin, the message to the client
// and the money summary (accounting). Pure functions (no Payload, no I/O) so they can be tested.

import { type BuyerDoc, type BuyerDocType, buyerTotal, goodsTotal, money, type Seller } from './trade-docs.ts'

const t = (v: unknown) => (v == null ? '' : String(v).trim())
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000

// Exchange rates typed by the owner in Company details for documents. Nothing is guessed: a
// conversion that needs a rate that is not there gives null and the caller says so.
export type Rates = { cnyPerUsd?: number | null; usdPerEur?: number | null }

// Value of 1 unit of the currency in US dollars, or null when the rate is missing.
export function usdPerUnit(currency: string | null | undefined, rates: Rates): number | null {
  const c = t(currency).toUpperCase() || 'USD'
  if (c === 'USD') return 1
  if (c === 'CNY') return rates.cnyPerUsd && rates.cnyPerUsd > 0 ? 1 / rates.cnyPerUsd : null
  if (c === 'EUR') return rates.usdPerEur && rates.usdPerEur > 0 ? rates.usdPerEur : null
  return null
}

export function convert(amount: number | null | undefined, from: string | null | undefined, to: string | null | undefined, rates: Rates): number | null {
  if (amount == null || !Number.isFinite(amount)) return null
  if ((t(from).toUpperCase() || 'USD') === (t(to).toUpperCase() || 'USD')) return amount
  const a = usdPerUnit(from, rates)
  const b = usdPerUnit(to, rates)
  return a == null || b == null ? null : round4((amount * a) / b)
}

// Cost plus margin, rounded to cents: 10.00 at 15% -> 11.50.
export function sellPrice(cost: number, marginPercent: number): number {
  return round2(cost * (1 + marginPercent / 100))
}

// ---------- Supplier quotations ----------

export type QuoteItem = {
  id?: string | null
  material: string
  requested?: string | null
  supplierProduct?: string | null
  spec?: string | null
  quantity?: number | null
  unit?: string | null
  quotedPrice?: number | null
  moq?: string | null
  leadTime?: string | null
  quoteNote?: string | null
}

export type QuotedEnquiry = {
  id: number | string
  number: string
  supplierId: string
  supplier: string
  status: string
  currency?: string | null
  incoterm?: string | null
  incotermPlace?: string | null
  quoteValidUntil?: string | null
  quoteReceivedAt?: string | null
  items: QuoteItem[]
}

export type QuoteOption = {
  rfqId: number | string
  rfqNumber: string
  itemId: string
  supplierId: string
  supplier: string
  material: string
  spec: string
  quantity: number | null
  unit: string
  price: number
  currency: string
  priceBasis: string
  // The price in the currency of the proforma invoice, or null when a rate is missing.
  converted: number | null
  moq: string
  leadTime: string
  note: string
  validUntil: string
  expired: boolean
}

export type QuoteLine = { requested: string; quantity: string; options: QuoteOption[] }

const norm = (v: unknown) => t(v).toLowerCase().replace(/\s+/g, ' ')

// Which order line a quoted item answers: the order line it was made from, else the same name.
function lineOf(item: QuoteItem, requested: string[]): number {
  const keys = [item.requested, item.material, item.supplierProduct].map(norm).filter(Boolean)
  for (const k of keys) {
    const i = requested.findIndex((r) => norm(r) === k)
    if (i >= 0) return i
  }
  return -1
}

// Every price received, per line of the customer order, cheapest first (in the PI currency).
// Quoted items that do not belong to any order line are listed at the end under their own name.
export function compareQuotes(
  orderLines: { requested: string; quantity?: string | null }[],
  enquiries: QuotedEnquiry[],
  piCurrency: string,
  rates: Rates,
  today = new Date().toISOString().slice(0, 10),
): QuoteLine[] {
  const lines: QuoteLine[] = orderLines.map((l) => ({ requested: l.requested, quantity: t(l.quantity), options: [] }))
  const requested = lines.map((l) => l.requested)
  for (const e of enquiries) {
    if (e.status === 'cancelled') continue
    for (const i of e.items) {
      if (i.quotedPrice == null || !(i.quotedPrice > 0)) continue
      const cur = t(e.currency) || 'USD'
      const valid = t(e.quoteValidUntil).slice(0, 10)
      const option: QuoteOption = {
        rfqId: e.id, rfqNumber: e.number, itemId: t(i.id), supplierId: e.supplierId, supplier: e.supplier,
        material: i.material, spec: t(i.spec), quantity: i.quantity ?? null, unit: t(i.unit) || 'kg',
        price: i.quotedPrice, currency: cur, priceBasis: [t(e.incoterm), t(e.incotermPlace)].filter(Boolean).join(' '),
        converted: convert(i.quotedPrice, cur, piCurrency, rates), moq: t(i.moq), leadTime: t(i.leadTime), note: t(i.quoteNote),
        validUntil: valid, expired: valid !== '' && valid < today,
      }
      let k = lineOf(i, requested)
      if (k < 0) {
        k = lines.findIndex((l, n) => n >= orderLines.length && norm(l.requested) === norm(i.material))
        if (k < 0) {
          lines.push({ requested: i.material, quantity: '', options: [] })
          requested.push(i.material)
          k = lines.length - 1
        }
      }
      lines[k].options.push(option)
    }
  }
  for (const l of lines) l.options.sort((a, b) => (a.converted ?? Infinity) - (b.converted ?? Infinity) || a.price - b.price)
  return lines
}

// What a supplier may send through the quotation form: numbers stay numbers, text is cut short.
export type QuoteSubmission = {
  currency?: unknown
  incoterm?: unknown
  incotermPlace?: unknown
  validUntil?: unknown
  paymentTerms?: unknown
  contactName?: unknown
  notes?: unknown
  items?: { id?: unknown; price?: unknown; moq?: unknown; leadTime?: unknown; note?: unknown }[]
}
export type CleanQuote = {
  currency: string
  incoterm: string
  incotermPlace: string
  validUntil: string
  paymentTerms: string
  contactName: string
  notes: string
  items: { id: string; price: number | null; moq: string; leadTime: string; note: string }[]
}

// Control characters (other than tab and new line) are removed from what a supplier types.
const short = (v: unknown, n: number) => [...t(v)].filter((c) => c === '\t' || c === '\n' || (c >= ' ' && c !== '\u007f')).join('').slice(0, n)

export function cleanQuote(body: QuoteSubmission, itemIds: string[], currencies: string[], incoterms: string[]): CleanQuote | { error: string } {
  const currency = short(body.currency, 3).toUpperCase()
  if (!currencies.includes(currency)) return { error: 'Choose the currency' }
  const incoterm = short(body.incoterm, 3).toUpperCase()
  if (incoterm && !incoterms.includes(incoterm)) return { error: 'Choose the price basis' }
  const validUntil = short(body.validUntil, 10)
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return { error: 'The validity date is not a date' }
  const given = new Map((Array.isArray(body.items) ? body.items : []).slice(0, 200).map((i) => [t(i?.id), i]))
  const items = itemIds.map((id) => {
    const i = given.get(id)
    // A comma is accepted only between thousands ("1,250.50"); "12,5" is refused, never read as 125.
    const typed = t(i?.price)
    const raw = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(typed) ? typed.replace(/,/g, '') : typed
    const n = raw === '' || raw.includes(',') ? (raw === '' ? null : NaN) : Number(raw)
    return { id, price: n != null && Number.isFinite(n) && n > 0 && n < 1e9 ? round4(n) : null, moq: short(i?.moq, 80), leadTime: short(i?.leadTime, 80), note: short(i?.note, 300) }
  })
  if (items.some((i, k) => i.price == null && t(given.get(itemIds[k])?.price).includes(','))) return { error: 'Use a dot for decimals, e.g. 12.50' }
  if (items.some((i, k) => i.price == null && t(given.get(itemIds[k])?.price) !== '')) return { error: 'A price is not a number' }
  if (!items.some((i) => i.price != null)) return { error: 'Enter a price for at least one item' }
  return {
    currency, incoterm, incotermPlace: short(body.incotermPlace, 80), validUntil, paymentTerms: short(body.paymentTerms, 200),
    contactName: short(body.contactName, 120), notes: short(body.notes, 2000), items,
  }
}

// ---------- The client ----------

const DOC_NAME: Record<BuyerDocType, string> = { pi: 'Proforma invoice', invoice: 'Commercial invoice', 'packing-list': 'Packing list' }

export function clientMessage(d: BuyerDoc, seller: Seller, type: BuyerDocType): { subject: string; body: string } {
  const name = DOC_NAME[type]
  const number = type === 'pi' ? d.piNumber : t(d.invoiceNumber) || d.piNumber
  const total = buyerTotal(d)
  const cur = t(d.currency) || 'USD'
  const greeting = `Dear ${t(d.buyerContact).split(/[,(]/)[0].trim() || 'Sir or Madam'},`
  const sign = [t(seller.signatoryName), t(seller.signatoryTitle), seller.companyName, t(seller.email), t(seller.phone), t(seller.website)].filter(Boolean).join('\n')
  const ref = t(d.buyerReference) ? ` for your order ${t(d.buyerReference)}` : ''
  const lines =
    type === 'pi'
      ? [
          `Please find attached our proforma invoice ${number}${ref}.`,
          total ? `Total: ${cur} ${money(total)}${t(d.incoterm) ? ` ${t(d.incoterm)} ${t(d.incotermPlace)}`.trimEnd() : ''}.` : '',
          t(d.paymentTerms) ? `Payment: ${t(d.paymentTerms)}.` : '',
          t(d.validity) ? `This offer is valid until ${t(d.validity).slice(0, 10)}.` : '',
          'Please confirm by reply, and send the payment slip once the transfer is made so that we can start the order.',
        ]
      : type === 'invoice'
        ? [`Please find attached the commercial invoice ${number}${ref}.`, total ? `Total: ${cur} ${money(total)}.` : '', t(d.blNumber) ? `B/L or AWB no.: ${t(d.blNumber)}.` : '']
        : [`Please find attached the packing list for invoice ${number}${ref}.`, t(d.blNumber) ? `B/L or AWB no.: ${t(d.blNumber)}.` : '']
  return {
    subject: `${name} ${number} (${seller.companyName})`,
    body: [greeting, lines.filter(Boolean).join('\n'), `Best regards,\n${sign}`].join('\n\n'),
  }
}

// What the sale costs us, from the cost price kept on each PI item (never printed).
export function saleMargin(d: { items: { quantity?: number | null; unitPrice?: number | null; costPrice?: number | null }[] }): {
  sales: number; cost: number | null; profit: number | null; percent: number | null; missingCost: number
} {
  const sales = goodsTotal(d.items)
  const missingCost = d.items.filter((i) => i.costPrice == null && i.quantity != null && i.unitPrice != null).length
  const priced = d.items.filter((i) => i.costPrice != null && i.quantity != null)
  if (!priced.length) return { sales, cost: null, profit: null, percent: null, missingCost }
  const cost = round2(priced.reduce((s, i) => s + (i.costPrice ?? 0) * (i.quantity ?? 0), 0))
  const profit = round2(sales - cost)
  return { sales, cost, profit, percent: cost > 0 ? round2((profit / cost) * 100) : null, missingCost }
}

// ---------- Accounting ----------

export type Money = { amount: number; currency: string; usdRate?: number | null }
export type PaymentRow = Money & {
  id: number | string
  date: string
  direction: 'in' | 'out' | 'expense'
  category?: string | null
  void?: boolean | null
  buyerDocId?: string | null
  supplierOrderId?: string | null
  orderId?: string | null
  party: string
  reference?: string | null
  method?: string | null
  notes?: string | null
}
export type SaleRow = { id: string; number: string; invoiceNumber: string; buyer: string; date: string; status: string; orderId: string | null; total: Money; estimatedCost: number | null; costSuppliers?: string[] }
export type PurchaseRow = { id: string; number: string; supplier: string; supplierId?: string | null; date: string; status: string; orderId: string | null; total: Money }

// A payment's value in US dollars: its own rate when one was typed, else the rate in settings.
export function toUsd(m: Money, rates: Rates): number | null {
  if ((t(m.currency).toUpperCase() || 'USD') === 'USD') return round2(m.amount)
  if (m.usdRate && m.usdRate > 0) return round2(m.amount * m.usdRate)
  const r = usdPerUnit(m.currency, rates)
  return r == null ? null : round2(m.amount * r)
}

export type Overview = {
  from: string
  to: string
  missingRates: string[]
  totals: { received: number; paidSuppliers: number; expenses: number; cashNet: number; receivable: number; payable: number; profit: number }
  sales: { committed: boolean; id: string; number: string; invoiceNumber: string; buyer: string; date: string; status: string; totalUsd: number | null; receivedUsd: number; outstandingUsd: number | null; costUsd: number | null; costIsEstimate: boolean; expensesUsd: number; profitUsd: number | null }[]
  purchases: { id: string; number: string; supplier: string; date: string; status: string; totalUsd: number | null; paidUsd: number; owedUsd: number | null }[]
  ledger: (PaymentRow & { usd: number | null })[]
}

const inRange = (d: string, from: string, to: string) => (!from || d >= from) && (!to || d <= to)

// Money in and out for a period, what each client still owes, what we still owe each supplier, and
// the profit per sale (sale total, less the purchase orders and the costs booked on the same order).
// Sales and purchases count by their date; cancelled ones are left out. Everything is in US dollars.
export function accountsOverview(sales: SaleRow[], purchases: PurchaseRow[], payments: PaymentRow[], rates: Rates, from = '', to = ''): Overview {
  const missing = new Set<string>()
  const usd = (m: Money) => {
    const v = toUsd(m, rates)
    if (v == null) missing.add(t(m.currency).toUpperCase())
    return v
  }
  const live = payments.filter((p) => !p.void)
  const ledger = live.filter((p) => inRange(p.date, from, to)).sort((a, b) => a.date.localeCompare(b.date)).map((p) => ({ ...p, usd: usd(p) }))
  const sum = (rows: { usd: number | null }[]) => round2(rows.reduce((s, r) => s + (r.usd ?? 0), 0))

  // Payments are matched to sales and purchases over all time: a sale in this period may be paid later.
  const allUsd = live.map((p) => ({ ...p, usd: usd(p) }))
  // A draft purchase order is not owed yet; a cancelled one never is.
  const pos = purchases.filter((p) => p.status !== 'cancelled' && p.status !== 'draft')
  const purchaseOut = pos.map((p) => {
    const totalUsd = usd(p.total)
    const paidUsd = sum(allUsd.filter((x) => x.direction === 'out' && x.supplierOrderId === p.id))
    return { id: p.id, number: p.number, supplier: p.supplier, supplierId: p.supplierId ?? null, date: p.date, status: p.status, orderId: p.orderId, totalUsd, paidUsd, owedUsd: totalUsd == null ? null : round2(totalUsd - paidUsd) }
  })
  const liveSales = sales.filter((s) => s.status !== 'cancelled')
  // Purchase orders and costs booked on a customer order (not on a sale) belong to one sale: the
  // first one on that order. Purchase orders replace the PI cost only when that order has a single
  // sale and there is a purchase order from every supplier the PI items were costed on.
  const firstOnOrder = new Map<string, string>()
  for (const s of [...liveSales].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) if (s.orderId && !firstOnOrder.has(s.orderId)) firstOnOrder.set(s.orderId, s.id)
  const salesOnOrder = (orderId: string) => liveSales.filter((s) => s.orderId === orderId).length
  const saleOut = liveSales
    .map((s) => {
      const totalUsd = usd(s.total)
      const receivedUsd = sum(allUsd.filter((x) => x.direction === 'in' && x.buyerDocId === s.id))
      const linkedPos = s.orderId && salesOnOrder(s.orderId) === 1 ? purchaseOut.filter((p) => p.orderId === s.orderId) : []
      const needed = [...new Set(s.costSuppliers ?? [])]
      const covered = needed.length > 0 ? needed.every((sup) => linkedPos.some((p) => p.supplierId === sup)) : s.estimatedCost == null
      const poCost = linkedPos.length && covered && linkedPos.every((p) => p.totalUsd != null) ? round2(linkedPos.reduce((a, p) => a + (p.totalUsd ?? 0), 0)) : null
      const est = s.estimatedCost != null ? usd({ amount: s.estimatedCost, currency: s.total.currency, usdRate: s.total.usdRate }) : null
      const costUsd = poCost ?? est
      const expensesUsd = sum(allUsd.filter((x) => x.direction === 'expense' && (x.buyerDocId === s.id || (s.orderId != null && x.orderId === s.orderId && !x.buyerDocId && firstOnOrder.get(s.orderId) === s.id))))
      // A sale counts (owed, profit) once the client has confirmed it or paid something.
      const committed = !['draft', 'PI sent'].includes(s.status) || receivedUsd > 0
      return {
        committed,
        id: s.id, number: s.number, invoiceNumber: s.invoiceNumber, buyer: s.buyer, date: s.date, status: s.status, totalUsd, receivedUsd,
        outstandingUsd: totalUsd == null ? null : round2(totalUsd - receivedUsd), costUsd, costIsEstimate: poCost == null && est != null, expensesUsd,
        profitUsd: totalUsd == null || costUsd == null ? null : round2(totalUsd - costUsd - expensesUsd),
      }
    })
  const salesIn = saleOut.filter((s) => inRange(s.date, from, to))
  const received = sum(ledger.filter((p) => p.direction === 'in'))
  const paidSuppliers = sum(ledger.filter((p) => p.direction === 'out'))
  const expenses = sum(ledger.filter((p) => p.direction === 'expense'))
  return {
    from,
    to,
    missingRates: [...missing],
    totals: {
      received, paidSuppliers, expenses, cashNet: round2(received - paidSuppliers - expenses),
      // What is owed is at today, whatever the period.
      receivable: round2(saleOut.filter((x) => x.committed).reduce((a, x) => a + Math.max(0, x.outstandingUsd ?? 0), 0)),
      payable: round2(purchaseOut.reduce((a, p) => a + Math.max(0, p.owedUsd ?? 0), 0)),
      profit: round2(salesIn.filter((x) => x.committed).reduce((a, x) => a + (x.profitUsd ?? 0), 0)),
    },
    sales: salesIn,
    purchases: purchaseOut.filter((p) => inRange(p.date, from, to)).map((p) => ({ id: p.id, number: p.number, supplier: p.supplier, date: p.date, status: p.status, totalUsd: p.totalUsd, paidUsd: p.paidUsd, owedUsd: p.owedUsd })),
    ledger,
  }
}

