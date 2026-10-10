// Trade documents: supplier enquiry (RFQ), purchase order (PO), and for the buyer the proforma
// invoice (PI), commercial invoice and packing list. Pure functions (no Payload, no I/O) so they
// can be tested: numbers, totals, the message to the supplier, and the layout spec that
// trade-pdf.ts draws.

export type Seller = {
  companyName: string
  // A brand the legal company trades under (e.g. NJMC Medical Supplies, operated by Medicayal Pharma
  // Co., Ltd.): printed large on documents, with the legal name under it.
  brandName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  signatoryName?: string | null
  signatoryTitle?: string | null
  bankDetails?: string | null
  logo?: { data: Uint8Array; type: 'png' | 'jpg' } | null
}

export type SupplierOrderKind = 'rfq' | 'po'

export type SupplierOrderItem = {
  material: string
  supplierProduct?: string | null
  spec?: string | null
  quantity?: number | null
  unit?: string | null
  unitPrice?: number | null
  note?: string | null
}

export type SupplierOrderDoc = {
  kind: SupplierOrderKind
  number: string
  date: string
  supplierName: string
  supplierAddress?: string | null
  contactPerson?: string | null
  supplierSource?: string | null
  items: SupplierOrderItem[]
  currency?: string | null
  incoterm?: string | null
  incotermPlace?: string | null
  paymentTerms?: string | null
  delivery?: string | null
  destination?: string | null
  documentsRequired?: string | null
  notes?: string | null
  // Enquiries only: the page where the supplier types the prices (no login).
  quoteLink?: string | null
}

export type BuyerItem = {
  description: string
  spec?: string | null
  hsCode?: string | null
  origin?: string | null
  quantity?: number | null
  unit?: string | null
  unitPrice?: number | null
  packages?: number | null
  packageType?: string | null
  netWeight?: number | null
  grossWeight?: number | null
  batchNo?: string | null
  mfgDate?: string | null
  expDate?: string | null
}

export type BuyerDoc = {
  piNumber: string
  piDate: string
  invoiceNumber?: string | null
  invoiceDate?: string | null
  buyerName: string
  buyerAddress?: string | null
  buyerCountry?: string | null
  buyerContact?: string | null
  consignee?: string | null
  notifyParty?: string | null
  buyerReference?: string | null
  items: BuyerItem[]
  currency?: string | null
  incoterm?: string | null
  incotermPlace?: string | null
  paymentTerms?: string | null
  portOfLoading?: string | null
  portOfDischarge?: string | null
  shipmentBy?: string | null
  deliveryTime?: string | null
  validity?: string | null
  vessel?: string | null
  blNumber?: string | null
  shippingMarks?: string | null
  freight?: number | null
  insurance?: number | null
  discount?: number | null
  remarks?: string | null
}

export type BuyerDocType = 'pi' | 'invoice' | 'packing-list'

// What trade-pdf.ts draws: a header, two blocks of label/value pairs, one table, totals, sections.
export type Column = { header: string; width: number; align?: 'left' | 'right' }
export type DocSpec = {
  seller: Seller
  title: string
  left: { heading: string; lines: string[] }
  right: [string, string][]
  columns: Column[]
  rows: string[][]
  totals: [string, string][]
  sections: { heading: string; text: string }[]
  signature: string
  fileName: string
}

const t = (v: unknown) => (v == null ? '' : String(v).trim())

// The name people see (the brand when there is one) and the full name with the legal company.
export const tradingName = (s: Pick<Seller, 'companyName' | 'brandName'>) => t(s.brandName) || s.companyName
export const fullName = (s: Pick<Seller, 'companyName' | 'brandName'>) => (t(s.brandName) ? `${t(s.brandName)} (${s.companyName})` : s.companyName)

// The company code at the start of every document number (NJMC-PI-2026-0001). Another company using
// this software sets DOC_PREFIX in its server settings.
export function docPrefix(): string {
  const p = String(process.env.DOC_PREFIX ?? '').toUpperCase()
  return /^[A-Z0-9]{2,8}$/.test(p) ? p : 'NJMC'
}

export function docNumber(prefix: 'RFQ' | 'PO' | 'PI' | 'INV', year: number, seq: number): string {
  return `${docPrefix()}-${prefix}-${year}-${String(seq).padStart(4, '0')}`
}

// Next free sequence for a prefix and year, from the numbers already used.
export function nextSeq(existing: (string | null | undefined)[], prefix: string, year: number): number {
  const re = new RegExp(`^${docPrefix()}-${prefix}-${year}-(\\d+)$`)
  return existing.reduce((max, n) => Math.max(max, Number(re.exec(t(n))?.[1] ?? 0)), 0) + 1
}

// Addresses in a free-text email field: "a@x.cn; b@x.cn (business card)" -> ["a@x.cn", "b@x.cn"].
// A file name that is safe in a download header: Latin letters, digits, space, dot, dash.
export function safeFileName(name: string): string {
  return name.replace(/[^A-Za-z0-9 ._-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'document.pdf'
}

export function emailsIn(text: unknown): string[] {
  const found = t(text).match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/g) ?? []
  return [...new Set(found.map((e) => e.toLowerCase().replace(/\.$/, '')))]
}

// "200", "1,050 kg", "600000 pcs" -> number and unit. Anything else stays text in the item note.
export function parseQuantity(text: unknown): { quantity: number | null; unit: string } {
  const m = /^\s*([\d.,]+)\s*([A-Za-z]{0,8})\s*$/.exec(t(text))
  if (!m) return { quantity: null, unit: '' }
  const raw = m[1].replace(/,(?=\d{3}\b)/g, '')
  const n = Number(raw)
  return Number.isFinite(n) && /^\d+(\.\d+)?$/.test(raw) ? { quantity: n, unit: m[2].toLowerCase() } : { quantity: null, unit: '' }
}

export function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function qty(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  return n.toLocaleString('en-US', { maximumFractionDigits: 3 })
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function lineAmount(i: { quantity?: number | null; unitPrice?: number | null }): number | null {
  return i.quantity != null && i.unitPrice != null ? round2(i.quantity * i.unitPrice) : null
}

export function goodsTotal(items: { quantity?: number | null; unitPrice?: number | null }[]): number {
  return round2(items.reduce((s, i) => s + (lineAmount(i) ?? 0), 0))
}

export function buyerTotal(d: BuyerDoc): number {
  return round2(goodsTotal(d.items) + (d.freight ?? 0) + (d.insurance ?? 0) - (d.discount ?? 0))
}

const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN',
  'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN']
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY']

function below1000(n: number): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ''}`
  return [h ? `${ONES[h]} HUNDRED` : '', rest].filter(Boolean).join(' AND ')
}

const CURRENCY_WORDS: Record<string, [string, string]> = { USD: ['US DOLLARS', 'CENTS'], EUR: ['EUROS', 'CENTS'], CNY: ['CHINESE YUAN', 'FEN'] }

// 111173.5, "USD" -> "SAY US DOLLARS ONE HUNDRED AND ELEVEN THOUSAND ONE HUNDRED AND SEVENTY THREE AND CENTS FIFTY ONLY"
export function amountInWords(amount: number, currency = 'USD'): string {
  const [major, minor] = CURRENCY_WORDS[currency] ?? [currency, 'CENTS']
  const cents = Math.round(amount * 100)
  let whole = Math.floor(cents / 100)
  const frac = cents % 100
  if (whole >= 1e12) return ''
  const parts: string[] = []
  for (const [size, name] of [[1e9, 'BILLION'], [1e6, 'MILLION'], [1e3, 'THOUSAND']] as [number, string][]) {
    if (whole >= size) {
      parts.push(`${below1000(Math.floor(whole / size))} ${name}`)
      whole %= size
    }
  }
  if (whole || !parts.length) parts.push(whole ? below1000(whole) : 'ZERO')
  return `SAY ${major} ${parts.join(' ')}${frac ? ` AND ${minor} ${below1000(frac)}` : ''} ONLY`
}

const incoterm = (d: { incoterm?: string | null; incotermPlace?: string | null }) => [t(d.incoterm), t(d.incotermPlace)].filter(Boolean).join(' ')

function itemLine(i: SupplierOrderItem, n: number): string {
  const q = i.quantity != null ? `${qty(i.quantity)} ${t(i.unit) || 'kg'}` : ''
  return `${n}. ${[t(i.material), q, t(i.spec)].filter(Boolean).join(', ')}`
}

const DEFAULT_ASK = [
  'price per unit and the price basis (EXW, or FOB with the port)',
  'minimum order quantity and packing',
  'lead time',
  'pharmacopoeia grade (BP, USP or EP) and a recent certificate of analysis',
  'GMP certificate, and the DMF or CEP status where it applies',
]

// The email to the supplier. Plain text, short, in English.
export function supplierMessage(d: SupplierOrderDoc, seller: Seller): { subject: string; body: string } {
  const n = d.items.length
  const what = `${n} ${n === 1 ? 'item' : 'items'}`
  const greeting = `Dear ${t(d.contactPerson).split(/[,(]/)[0].trim() || 'Sir or Madam'},`
  const sign = [t(seller.signatoryName), t(seller.signatoryTitle), t(seller.brandName), seller.companyName, t(seller.email), t(seller.phone), t(seller.website)].filter(Boolean).join('\n')
  const list = d.items.map((i, k) => itemLine(i, k + 1)).join('\n')
  if (d.kind === 'rfq') {
    const cphi = /cphi/i.test(t(d.supplierSource)) ? ' We have your product list from CPHI.' : ''
    return {
      subject: `Enquiry ${d.number}: ${what} (${tradingName(seller)})`,
      body: [
        greeting,
        `${fullName(seller)} is a pharmaceutical sourcing and trading company in Nanjing, China.${cphi} We have a customer enquiry for the following and would like your quotation:`,
        list,
        `Please send us:\n${DEFAULT_ASK.map((a) => `- ${a}`).join('\n')}`,
        [d.destination ? `Destination: ${t(d.destination)}.` : '', d.delivery ? `Delivery needed: ${t(d.delivery)}.` : '', t(d.notes)].filter(Boolean).join('\n'),
        d.quoteLink
          ? `The enquiry is attached as a PDF (${d.number}). The quickest way to answer is to enter your prices on this page (no login needed):\n${t(d.quoteLink)}\nYou can also reply to this email.`
          : `The enquiry is attached as a PDF (${d.number}). Please reply to this email.`,
        `Best regards,\n${sign}`,
      ].filter(Boolean).join('\n\n'),
    }
  }
  const total = goodsTotal(d.items)
  return {
    subject: `Purchase order ${d.number} (${tradingName(seller)})`,
    body: [
      greeting,
      `Please find attached our purchase order ${d.number} for ${what}:`,
      list,
      [
        total ? `Order value: ${t(d.currency) || 'USD'} ${money(total)}${incoterm(d) ? `, ${incoterm(d)}` : ''}.` : '',
        d.paymentTerms ? `Payment: ${t(d.paymentTerms)}.` : '',
        d.delivery ? `Delivery: ${t(d.delivery)}.` : '',
      ].filter(Boolean).join('\n'),
      'Please confirm the order by reply and send your proforma invoice with your bank details, the packing details and the expected ready date.',
      `Best regards,\n${sign}`,
    ].filter(Boolean).join('\n\n'),
  }
}

export function supplierOrderSpec(d: SupplierOrderDoc, seller: Seller): DocSpec {
  const cur = t(d.currency) || 'USD'
  const rfq = d.kind === 'rfq'
  const total = goodsTotal(d.items)
  const terms: [string, string][] = [
    ['Price basis', incoterm(d)],
    ['Payment', t(d.paymentTerms)],
    [rfq ? 'Delivery needed' : 'Delivery', t(d.delivery)],
    ['Destination', t(d.destination)],
  ]
  return {
    seller,
    title: rfq ? 'REQUEST FOR QUOTATION' : 'PURCHASE ORDER',
    left: { heading: 'To (supplier)', lines: [d.supplierName, t(d.supplierAddress), d.contactPerson ? `Attention: ${t(d.contactPerson)}` : ''].filter(Boolean) },
    right: [[rfq ? 'Enquiry no.' : 'PO no.', d.number], ['Date', d.date], ...(rfq ? [] : ([['Currency', cur]] as [string, string][]))],
    columns: rfq
      ? [{ header: 'No.', width: 28 }, { header: 'Material', width: 190 }, { header: 'Grade / specification', width: 150 }, { header: 'Quantity', width: 70, align: 'right' }, { header: 'Unit', width: 40 }, { header: 'Your price', width: 45 }]
      : [{ header: 'No.', width: 28 }, { header: 'Material', width: 165 }, { header: 'Grade / specification', width: 120 }, { header: 'Quantity', width: 60, align: 'right' }, { header: 'Unit', width: 35 },
          { header: `Unit price (${cur})`, width: 55, align: 'right' }, { header: `Amount (${cur})`, width: 60, align: 'right' }],
    rows: d.items.map((i, k) => {
      const name = [t(i.material), i.supplierProduct && t(i.supplierProduct).toLowerCase() !== t(i.material).toLowerCase() ? `(your list: ${t(i.supplierProduct)})` : '', t(i.note)].filter(Boolean).join('\n')
      const base = [String(k + 1), name, t(i.spec), qty(i.quantity), t(i.unit) || (i.quantity != null ? 'kg' : '')]
      return rfq ? [...base, ''] : [...base, money(i.unitPrice), money(lineAmount(i))]
    }),
    totals: rfq || !total ? [] : [[`Total (${cur})`, money(total)], ['', amountInWords(total, cur)]],
    sections: [
      { heading: 'Terms', text: terms.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n') },
      rfq
        ? { heading: 'Please quote', text: [...DEFAULT_ASK.map((a) => `- ${a}`), d.quoteLink ? `\nEnter your prices online: ${t(d.quoteLink)}` : ''].filter(Boolean).join('\n') }
        : { heading: 'Documents required with the goods', text: t(d.documentsRequired) },
      { heading: 'Notes', text: t(d.notes) },
    ].filter((s) => s.text),
    signature: rfq ? '' : `For ${seller.companyName}`,
    fileName: `${d.number}.pdf`,
  }
}

const sum = (items: BuyerItem[], k: 'packages' | 'netWeight' | 'grossWeight' | 'quantity') => items.reduce((s, i) => s + (i[k] ?? 0), 0)

export function buyerDocSpec(d: BuyerDoc, seller: Seller, type: BuyerDocType): DocSpec {
  const cur = t(d.currency) || 'USD'
  const pi = type === 'pi'
  const number = pi ? d.piNumber : t(d.invoiceNumber) || d.piNumber
  const date = pi ? d.piDate : t(d.invoiceDate) || d.piDate
  const left = { heading: pi ? 'Buyer' : 'Buyer / consignee', lines: [d.buyerName, t(d.buyerAddress), t(d.buyerCountry), d.buyerContact ? `Attention: ${t(d.buyerContact)}` : ''].filter(Boolean) }
  const shipping: [string, string][] = [
    ['Port of loading', t(d.portOfLoading)],
    ['Port of discharge', t(d.portOfDischarge)],
    ['Shipment', t(d.shipmentBy)],
    ['Vessel / flight', pi ? '' : t(d.vessel)],
    ['B/L or AWB no.', pi ? '' : t(d.blNumber)],
  ]
  const right: [string, string][] = [
    [pi ? 'PI no.' : type === 'invoice' ? 'Invoice no.' : 'Packing list no.', number],
    ['Date', date],
    ...(pi ? [] : ([['PI no.', d.piNumber]] as [string, string][])),
    ['Your reference', t(d.buyerReference)],
    ...shipping,
  ].filter(([, v]) => v) as [string, string][]
  const parties = [
    { heading: 'Consignee', text: t(d.consignee) },
    { heading: 'Notify party', text: t(d.notifyParty) },
  ]
  const desc = (i: BuyerItem) => [t(i.description), t(i.spec)].filter(Boolean).join('\n')

  if (type === 'packing-list') {
    const pk = sum(d.items, 'packages')
    const nw = sum(d.items, 'netWeight')
    const gw = sum(d.items, 'grossWeight')
    return {
      seller,
      title: 'PACKING LIST',
      left,
      right,
      columns: [{ header: 'No.', width: 24 }, { header: 'Description of goods', width: 150 }, { header: 'Batch no.', width: 62 }, { header: 'Mfg / exp date', width: 62 }, { header: 'Quantity', width: 55, align: 'right' },
        { header: 'Packages', width: 80 }, { header: 'Net wt (kg)', width: 45, align: 'right' }, { header: 'Gross wt (kg)', width: 45, align: 'right' }],
      rows: d.items.map((i, k) => [
        String(k + 1), desc(i), t(i.batchNo), [t(i.mfgDate), t(i.expDate)].filter(Boolean).join(' / '), [qty(i.quantity), t(i.unit) || (i.quantity != null ? 'kg' : '')].filter(Boolean).join(' '),
        [i.packages != null ? qty(i.packages) : '', t(i.packageType)].filter(Boolean).join(' x '), qty(i.netWeight), qty(i.grossWeight),
      ]),
      totals: [['Total packages', pk ? qty(pk) : ''], ['Total net weight (kg)', nw ? qty(nw) : ''], ['Total gross weight (kg)', gw ? qty(gw) : '']].filter(([, v]) => v) as [string, string][],
      sections: [...parties, { heading: 'Shipping marks', text: t(d.shippingMarks) }, { heading: 'Remarks', text: t(d.remarks) }].filter((s) => s.text),
      signature: `For ${seller.companyName}`,
      fileName: `Packing list ${number}.pdf`,
    }
  }

  const goods = goodsTotal(d.items)
  const total = buyerTotal(d)
  const extras: [string, string][] = [
    ['Freight', d.freight ? money(d.freight) : ''],
    ['Insurance', d.insurance ? money(d.insurance) : ''],
    ['Discount', d.discount ? `-${money(d.discount)}` : ''],
  ].filter(([, v]) => v) as [string, string][]
  const terms: [string, string][] = [
    ['Price basis', incoterm(d)],
    ['Payment', t(d.paymentTerms)],
    ['Delivery time', pi ? t(d.deliveryTime) : ''],
    ['This proforma invoice is valid until', pi ? t(d.validity) : ''],
  ]
  return {
    seller,
    title: pi ? 'PROFORMA INVOICE' : 'COMMERCIAL INVOICE',
    left,
    right,
    columns: [{ header: 'No.', width: 24 }, { header: 'Description of goods', width: 178 }, { header: 'HS code', width: 55 }, { header: 'Origin', width: 50 }, { header: 'Quantity', width: 55, align: 'right' }, { header: 'Unit', width: 31 },
      { header: `Unit price (${cur})`, width: 60, align: 'right' }, { header: `Amount (${cur})`, width: 70, align: 'right' }],
    rows: d.items.map((i, k) => [String(k + 1), desc(i), t(i.hsCode), t(i.origin), qty(i.quantity), t(i.unit) || (i.quantity != null ? 'kg' : ''), money(i.unitPrice), money(lineAmount(i))]),
    totals: total
      ? [...(extras.length ? ([[`Goods (${cur})`, money(goods)], ...extras] as [string, string][]) : []), [`Total ${incoterm(d)} (${cur})`.replace(/\s+/g, ' '), money(total)], ['', amountInWords(total, cur)]]
      : [],
    sections: [
      { heading: 'Terms', text: terms.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n') },
      ...parties,
      { heading: 'Bank details', text: t(seller.bankDetails) },
      { heading: 'Shipping marks', text: pi ? '' : t(d.shippingMarks) },
      { heading: 'Remarks', text: t(d.remarks) },
    ].filter((s) => s.text),
    signature: `For ${seller.companyName}`,
    fileName: `${pi ? 'Proforma invoice' : 'Commercial invoice'} ${number}.pdf`,
  }
}

// The PDFs are drawn with Latin fonts: Chinese, Arabic and other scripts do not print.
const unprintable = (v: unknown) => /[\u0100-\u200f\u2028-\uffff]/.test(t(v))
const none = (n: number | null | undefined) => n == null || !(n > 0)

// What is still missing before a document is fit to send; shown in the admin. The ones in
// BLOCKS_SENDING stop the send button.
export const BLOCKS_SENDING = /^(no items|no email|a price|a quantity)/
export function supplierOrderGaps(d: SupplierOrderDoc, to: string[]): string[] {
  const gaps: string[] = []
  if (!d.items.length) gaps.push('no items')
  if (!to.length) gaps.push('no email address for this supplier: send it by WeChat or phone, or add the email')
  if (d.kind === 'po') {
    if (d.items.some((i) => none(i.unitPrice))) gaps.push('a price is missing')
    if (d.items.some((i) => none(i.quantity))) gaps.push('a quantity is missing')
    if (!t(d.paymentTerms)) gaps.push('payment terms are empty')
  }
  if (unprintable(d.supplierName) || unprintable(d.supplierAddress)) gaps.push('the supplier name or address has Chinese or Arabic characters, which the PDF leaves out: add the English name on the supplier record')
  if (d.items.some((i) => unprintable(i.material) || unprintable(i.spec))) gaps.push('an item has Chinese or Arabic characters, which the PDF leaves out')
  return gaps
}

export function buyerDocGaps(d: BuyerDoc, seller: Seller, type: BuyerDocType): string[] {
  const gaps: string[] = []
  if (!d.items.length) gaps.push('no items')
  if (type !== 'packing-list') {
    if (d.items.some((i) => none(i.unitPrice) || none(i.quantity))) gaps.push('a price or quantity is missing')
    if (!t(seller.bankDetails)) gaps.push('bank details are empty (Company details for documents)')
    if (!t(d.paymentTerms)) gaps.push('payment terms are empty')
  } else if (d.items.some((i) => i.packages == null || i.grossWeight == null)) gaps.push('packages or weights are missing')
  if (!t(d.buyerAddress)) gaps.push('buyer address is empty')
  if (type !== 'pi' && !t(d.invoiceDate)) gaps.push('the invoice date is empty (the invoice number is given when you fill it in)')
  if ([d.buyerName, d.buyerAddress, d.consignee, d.notifyParty].some(unprintable) || d.items.some((i) => unprintable(i.description))) gaps.push('some text has Chinese or Arabic characters, which the PDF leaves out: write it in English')
  return gaps
}
