import type { CollectionBeforeChangeHook, CollectionConfig, PayloadHandler, PayloadRequest } from 'payload'

import { accountsOverview, type PaymentRow, type PurchaseRow, type SaleRow, toUsd } from '../lib/order-desk.ts'
import { overviewXlsx } from '../lib/order-desk-xlsx.ts'
import { buyerTotal, goodsTotal } from '../lib/trade-docs.ts'
import { signedIn } from './access.ts'
import { CURRENCIES } from './SupplierOrders.ts'
import { loadSeller } from './TradeSettings.ts'

type AnyDoc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const idOf = (r: unknown) => (r && typeof r === 'object' ? (r as AnyDoc).id : (r as number | string | null | undefined))
const ids = (r: unknown) => (idOf(r) == null ? null : String(idOf(r)))
const nameOf = (r: unknown) => (r && typeof r === 'object' ? s((r as AnyDoc).name) : '')
const day = (v: unknown) => s(v).slice(0, 10)

export const EXPENSE_KINDS = ['freight', 'customs and duties', 'bank charges', 'inspection and testing', 'samples', 'travel', 'commission', 'office', 'other'].map((v) => ({ label: v, value: v }))

// The client, supplier and order follow from the linked sale or purchase order when left empty, and
// the US dollar value is kept with the rate used, so a later rate change does not rewrite the past.
const fill: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const merged = { ...originalDoc, ...data }
  const buyerId = idOf(merged.buyerDocument)
  if (buyerId && (!idOf(merged.client) || !idOf(merged.order))) {
    const b = (await req.payload.findByID({ collection: 'buyer-documents', id: buyerId, depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
    if (!idOf(merged.client) && b.client) data.client = idOf(b.client)
    if (!idOf(merged.order) && b.order) data.order = idOf(b.order)
  }
  const poId = idOf(merged.supplierOrder)
  if (poId && (!idOf(merged.supplier) || !idOf(merged.order))) {
    const p = (await req.payload.findByID({ collection: 'supplier-orders', id: poId, depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
    if (!idOf(merged.supplier) && p.supplier) data.supplier = idOf(p.supplier)
    if (!idOf(merged.order) && p.order) data.order = idOf(p.order)
  }
  // A new currency without a newly typed rate drops the old rate (it belonged to the old currency).
  if (originalDoc && data.currency && data.currency !== originalDoc.currency && data.usdRate === originalDoc.usdRate) {
    data.usdRate = null
    merged.usdRate = null
  }
  const { rates } = await loadSeller(req.payload, req)
  const amount = Number(merged.amount)
  const usd = Number.isFinite(amount) ? toUsd({ amount, currency: s(merged.currency) || 'USD', usdRate: merged.usdRate as number | null }, rates) : null
  data.amountUsd = usd
  if (s(merged.currency) !== 'USD' && !(Number(merged.usdRate) > 0) && usd != null && amount > 0) data.usdRate = Math.round((usd / amount) * 1e6) / 1e6
  return data
}

async function all(req: PayloadRequest, collection: 'payments' | 'buyer-documents' | 'supplier-orders', where?: Record<string, unknown>) {
  const res = await req.payload.find({ collection, where: where as never, limit: 0, depth: 1, joins: false as never, pagination: false, overrideAccess: true, req })
  return res.docs as unknown as AnyDoc[]
}

export async function loadOverview(req: PayloadRequest, from: string, to: string) {
  const { rates } = await loadSeller(req.payload, req)
  const [pays, buyers, pos] = await Promise.all([all(req, 'payments'), all(req, 'buyer-documents'), all(req, 'supplier-orders', { kind: { equals: 'po' } })])
  const sales: SaleRow[] = buyers.map((b) => {
    const items = (b.items as { quantity?: number | null; unitPrice?: number | null; costPrice?: number | null; costSupplier?: unknown }[]) ?? []
    const costed = items.filter((i) => i.costPrice != null && i.quantity != null)
    return {
      id: String(b.id), number: s(b.piNumber), invoiceNumber: s(b.invoiceNumber), buyer: nameOf(b.client) || s(b.buyerName), date: day(b.invoiceDate) || day(b.piDate), status: s(b.status), orderId: ids(b.order),
      total: { amount: buyerTotal({ items, freight: b.freight, insurance: b.insurance, discount: b.discount } as never), currency: s(b.currency) || 'USD' },
      estimatedCost: costed.length && costed.length === items.length ? costed.reduce((a, i) => a + (i.costPrice ?? 0) * (i.quantity ?? 0), 0) : null,
      costSuppliers: items.map((i) => ids(i.costSupplier)).filter((x): x is string => x != null),
    }
  })
  const purchases: PurchaseRow[] = pos.map((p) => ({
    id: String(p.id), number: s(p.number), supplier: nameOf(p.supplier), supplierId: ids(p.supplier), date: day(p.date), status: s(p.status), orderId: ids(p.order),
    total: { amount: goodsTotal((p.items as { quantity?: number | null; unitPrice?: number | null }[]) ?? []), currency: s(p.currency) || 'USD' },
  }))
  const payments: PaymentRow[] = pays.map((p) => ({
    id: p.id, date: day(p.date), direction: p.direction as PaymentRow['direction'], category: s(p.category), void: Boolean(p.void),
    amount: Number(p.amount) || 0, currency: s(p.currency) || 'USD', usdRate: (p.usdRate as number | null) ?? null,
    buyerDocId: ids(p.buyerDocument), supplierOrderId: ids(p.supplierOrder), orderId: ids(p.order),
    party: nameOf(p.client) || nameOf(p.supplier) || s(p.paidTo), reference: s(p.reference), method: s(p.method), notes: s(p.notes),
  }))
  return accountsOverview(sales, purchases, payments, rates, from, to)
}

const range = (req: PayloadRequest) => {
  const q = (req.query ?? {}) as Record<string, unknown>
  const ok = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(s(v)) ? s(v) : '')
  return { from: ok(q.from), to: ok(q.to) }
}

const overviewEndpoint: PayloadHandler = async (req) => {
  if (req.user?.collection !== 'users') return Response.json({ error: 'Not allowed' }, { status: 403 })
  const { from, to } = range(req)
  return Response.json(await loadOverview(req, from, to))
}

const exportEndpoint: PayloadHandler = async (req) => {
  if (req.user?.collection !== 'users') return Response.json({ error: 'Not allowed' }, { status: 403 })
  const { from, to } = range(req)
  const o = await loadOverview(req, from, to)
  const name = `Accounts ${from || 'start'} to ${to || new Date().toISOString().slice(0, 10)}`
  return new Response(new Uint8Array(await overviewXlsx(o)), {
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${name}.xlsx"`, 'Cache-Control': 'no-store' },
  })
}

// Money in and out: client payments received, payments to suppliers and our costs. A mistaken
// entry is marked void (with the reason), never deleted, so the books keep their history.
export const Payments: CollectionConfig = {
  slug: 'payments',
  labels: { singular: 'Payment or cost', plural: 'Money in and out' },
  admin: {
    group: 'Accounts',
    useAsTitle: 'reference',
    defaultColumns: ['date', 'direction', 'amount', 'currency', 'client', 'supplier', 'reference'],
    description: 'Every payment received from a client, paid to a supplier, and every cost (freight, bank charges). Link it to the sale or the purchase order so the balances add up.',
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  hooks: { beforeChange: [fill] },
  endpoints: [
    { path: '/overview', method: 'get', handler: overviewEndpoint },
    { path: '/export', method: 'get', handler: exportEndpoint },
  ],
  timestamps: true,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'date', type: 'date', required: true, defaultValue: () => new Date().toISOString(), admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
        {
          name: 'direction', type: 'select', required: true, label: 'What is it',
          options: [
            { label: 'Received from a client', value: 'in' },
            { label: 'Paid to a supplier', value: 'out' },
            { label: 'Cost (freight, bank charges, other)', value: 'expense' },
          ],
        },
        { name: 'category', type: 'select', label: 'Kind of cost', options: EXPENSE_KINDS, admin: { condition: (d) => d?.direction === 'expense' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'amount', type: 'number', required: true, min: 0 },
        { name: 'currency', type: 'select', required: true, defaultValue: 'USD', options: CURRENCIES.map((v) => ({ label: v, value: v })) },
        { name: 'usdRate', type: 'number', min: 0, label: 'USD for 1 unit', admin: { condition: (d) => d?.currency !== 'USD', description: 'The rate the bank used. Empty: the rate in Company details' } },
        { name: 'amountUsd', type: 'number', label: 'Value in USD', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'buyerDocument', type: 'relationship', relationTo: 'buyer-documents', label: 'For the sale (PI / invoice)', admin: { condition: (d) => d?.direction !== 'out' } },
        { name: 'supplierOrder', type: 'relationship', relationTo: 'supplier-orders', label: 'For the purchase order', filterOptions: { kind: { equals: 'po' } }, admin: { condition: (d) => d?.direction !== 'in' } },
        { name: 'order', type: 'relationship', relationTo: 'order-matches', label: 'Customer order' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'client', type: 'relationship', relationTo: 'clients', admin: { description: 'Filled from the sale when empty' } },
        { name: 'supplier', type: 'relationship', relationTo: 'suppliers', admin: { description: 'Filled from the purchase order when empty' } },
        { name: 'paidTo', type: 'text', label: 'Paid to (others)', admin: { condition: (d) => d?.direction === 'expense', description: 'e.g. the forwarder' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'method', type: 'select', options: ['T/T bank transfer', 'L/C', 'PayPal', 'Alipay', 'WeChat Pay', 'Cash', 'Other'].map((v) => ({ label: v, value: v })) },
        { name: 'reference', type: 'text', label: 'Bank reference', admin: { description: 'Transfer number or slip number' } },
        { name: 'proof', type: 'relationship', relationTo: 'trade-files', label: 'Payment slip', admin: { description: 'Upload it under Documents first, then choose it here' } },
      ],
    },
    { name: 'notes', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'void', type: 'checkbox', label: 'Void (entered by mistake)', defaultValue: false },
        { name: 'voidReason', type: 'text', label: 'Why', admin: { condition: (d) => Boolean(d?.void) } },
      ],
    },
  ],
}
