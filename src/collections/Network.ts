import type { CollectionConfig, Endpoint, PayloadHandler, PayloadRequest } from 'payload'

import { supplierScores } from '../lib/desk.ts'
import {
  BONUS_PER_SHARE, type Candidate, MAX_SHARES_PER_MONTH, monthKey, nameKey, type NetworkLine, type NetworkSupplier, type Plan, PLANS, productKey, rankSuppliers, sha256, SIGNAL_EVENTS,
  type SignalEvent, standingOf, type Stats, statsFromSignals, mergeStats, emptyStats, MAX_LINES, type Usage,
} from '../lib/network.ts'
import { matchOrder, type OrderRow } from '../lib/order-match.ts'
import type { EnquiryRow } from '../lib/desk.ts'
import { ownerOnly } from './access.ts'
import { loadEnquiries } from './Desk.ts'
import { loadProducts } from './OrderMatches.ts'
import { jsonBody, notJson } from './SupplierOrders.ts'

// The master side of the supplier network (NJMC's installation). Company installations made by
// deploy/new-company.sh carry a token; the master keeps only its SHA-256. What a client can see is
// capped by its plan (src/lib/network.ts): the suppliers for one product, the same ones every time.

type Doc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const idOf = (r: unknown) => (r && typeof r === 'object' ? String((r as Doc).id) : r == null ? '' : String(r))

export const NetworkClients: CollectionConfig = {
  slug: 'network-clients',
  labels: { singular: 'Network client', plural: 'Network clients' },
  admin: {
    useAsTitle: 'name', group: 'Settings', defaultColumns: ['name', 'slug', 'plan', 'active', 'usedThisMonth', 'lastSeenAt'],
    description: 'Companies using the order software (Trade Manager) that search our supplier database. Made by new-company.sh on the server; the plan and the caps can be changed here.',
  },
  access: { read: ownerOnly, create: ownerOnly, update: ownerOnly, delete: () => false },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      type: 'row',
      fields: [
        { name: 'slug', type: 'text', required: true, unique: true, admin: { description: 'The installation name on the server (/opt/njmc/clients/<slug>)' } },
        { name: 'plan', type: 'select', required: true, defaultValue: 'starter', options: Object.entries(PLANS).map(([value, p]) => ({ label: p.label, value })) },
        { name: 'active', type: 'checkbox', defaultValue: true, admin: { description: 'Off = the installation gets "subscription paused" on every search' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'suppliersPerProduct', type: 'number', required: true, defaultValue: 3, min: 1, max: 20, label: 'Suppliers per product (up to)' },
        { name: 'productsPerMonth', type: 'number', required: true, defaultValue: 20, min: 1, max: 1000, label: 'Products a month' },
        { name: 'contactEmail', type: 'text', label: 'Contact e-mail' },
      ],
    },
    { name: 'notes', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'usedThisMonth', type: 'number', label: 'Products searched this month', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
        { name: 'usageMonth', type: 'text', access: { create: () => false, update: () => false }, admin: { readOnly: true } },
        { name: 'lastSeenAt', type: 'date', access: { create: () => false, update: () => false }, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    // SHA-256 of the installation's token. Nobody can read it through the API or the admin.
    { name: 'tokenHash', type: 'text', index: true, access: { read: () => false, create: () => false, update: () => false }, admin: { hidden: true } },
  ],
}

// One product revealed to one client: the suppliers it was shown, kept for good so a second
// search shows the same ones.
export const NetworkReveals: CollectionConfig = {
  slug: 'network-reveals',
  labels: { singular: 'Network reveal', plural: 'Network reveals' },
  admin: { group: 'Settings', defaultColumns: ['client', 'productLabel', 'month', 'createdAt'], description: 'Which suppliers each network client was shown, per product.' },
  access: { read: ownerOnly, create: () => false, update: () => false, delete: () => false },
  timestamps: true,
  fields: [
    { name: 'client', type: 'relationship', relationTo: 'network-clients', required: true, index: true },
    { name: 'productKey', type: 'text', required: true, index: true },
    { name: 'productLabel', type: 'text' },
    { name: 'month', type: 'text', index: true },
    { name: 'suppliers', type: 'array', fields: [{ name: 'supplier', type: 'relationship', relationTo: 'suppliers', required: true }] },
  ],
}

// What the network reports about a supplier (or a supplier a client shared with us).
export const NetworkSignals: CollectionConfig = {
  slug: 'network-signals',
  labels: { singular: 'Network signal', plural: 'Network signals' },
  admin: { group: 'Settings', defaultColumns: ['supplier', 'event', 'client', 'at'], description: 'How suppliers behaved with the network clients: feeds the scorecard. Never prices, never who the client traded with.' },
  access: { read: ownerOnly, create: () => false, update: () => false, delete: () => false },
  timestamps: true,
  fields: [
    { name: 'client', type: 'relationship', relationTo: 'network-clients', required: true, index: true },
    { name: 'supplier', type: 'relationship', relationTo: 'suppliers', required: true, index: true },
    { name: 'event', type: 'select', required: true, options: SIGNAL_EVENTS.map((v) => ({ label: v.replace('_', ' '), value: v })) },
    { name: 'days', type: 'number', admin: { description: 'Reply time in days, on a reply' } },
    { name: 'at', type: 'date', required: true },
    { name: 'month', type: 'text', index: true },
  ],
}

// ---------- endpoints (token access, no admin login) ----------

const err = (message: string, status: number) => Response.json({ error: message }, { status })

// One search per client at a time, so ten calls at once cannot each see "19 of 20 used" and all
// pass the cap. The master is one Node process; the unique index on (client, product) in the
// database is the second guard.
const busy = new Map<string, Promise<unknown>>()
async function oneAtATime<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = busy.get(key) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  busy.set(key, run.catch(() => null))
  try {
    return await run
  } finally {
    if (busy.get(key) === run.catch(() => null)) busy.delete(key)
  }
}

async function clientOf(req: PayloadRequest): Promise<Doc | null> {
  const token = s(req.headers.get('x-network-token')).trim()
  if (!/^[a-f0-9]{32,128}$/i.test(token)) return null
  const r = await req.payload.find({ collection: 'network-clients', where: { tokenHash: { equals: sha256(token) } }, limit: 1, depth: 0, overrideAccess: true, req })
  return (r.docs[0] as unknown as Doc) ?? null
}

async function usageOf(req: PayloadRequest, client: Doc): Promise<Usage> {
  const month = monthKey()
  const plan = (s(client.plan) || 'starter') as Plan
  const [used, shares] = await Promise.all([
    req.payload.count({ collection: 'network-reveals', where: { and: [{ client: { equals: client.id } }, { month: { equals: month } }] }, overrideAccess: true, req }),
    req.payload.count({ collection: 'network-signals', where: { and: [{ client: { equals: client.id } }, { month: { equals: month } }, { event: { equals: 'shared' } }] }, overrideAccess: true, req }),
  ])
  const perMonth = Number(client.productsPerMonth) || PLANS[plan].perMonth
  return { plan, perProduct: Number(client.suppliersPerProduct) || PLANS[plan].perProduct, used: used.totalDocs, limit: perMonth + BONUS_PER_SHARE * shares.totalDocs, month, shares: shares.totalDocs }
}

// Own dealings + the network's, per supplier. The enquiries are loaded once per call by the caller.
async function statsFor(req: PayloadRequest, ids: Set<string>, enquiries: EnquiryRow[]): Promise<Map<string, Stats>> {
  if (!ids.size) return new Map()
  const signals = await req.payload.find({ collection: 'network-signals', where: { supplier: { in: [...ids] } }, limit: 0, pagination: false, depth: 0, overrideAccess: true, req })
  const own = supplierScores(enquiries.filter((e) => ids.has(e.supplierId)), [], { cnyPerUsd: null, usdPerEur: null })
  const net = statsFromSignals((signals.docs as unknown as Doc[]).map((d) => ({ supplierId: idOf(d.supplier), event: d.event as SignalEvent, days: d.days as number | null, clientId: idOf(d.client) })))
  const out = new Map<string, Stats>()
  for (const id of ids) {
    const o = own.get(id)
    const ownStats: Stats = o ? { enquiries: o.enquiries, answered: o.answered, avgReplyDays: o.avgReplyDays, orders: o.orders, problems: 0 } : emptyStats()
    out.set(id, mergeStats(ownStats, net.get(id) ?? emptyStats()))
  }
  return out
}

const toNetworkSupplier = (d: Doc, listedAs: string, documents: string, stats: Stats): NetworkSupplier => ({
  ref: String(d.id), name: s(d.name), country: s(d.country), city: s(d.city), website: s(d.website), email: s(d.email), phone: s(d.phone), wechat: s(d.wechat),
  listedAs, documents, standing: standingOf(stats),
})

// POST { lines: [{ requested, cas?, grade?, quantity? }] }: the suppliers for each product, capped.
// Every line comes back in the same position (blank ones with nothing), so the client can match.
const searchHandler: PayloadHandler = async (req) => {
  const client = await clientOf(req)
  if (!client) return err('Not allowed', 403)
  if (!client.active) return err('This subscription is paused. Contact NJMC.', 402)
  const body = await jsonBody<{ lines?: unknown[] }>(req)
  if (!body) return notJson()
  const asked = (Array.isArray(body.lines) ? body.lines : []).slice(0, MAX_LINES).map((l) => (l && typeof l === 'object' ? (l as Record<string, unknown>) : {}))
  const rows: OrderRow[] = asked.map((l, i) => ({ text: s(l.requested).trim().slice(0, 300), cas: s(l.cas).slice(0, 40) || undefined, grade: s(l.grade).slice(0, 100) || undefined, quantity: s(l.quantity).slice(0, 60) || undefined, row: i + 1 }))
  if (!rows.some((r) => r.text)) return err('Send at least one material', 400)
  return oneAtATime(String(client.id), () => search(req, client, rows))
}

async function search(req: PayloadRequest, client: Doc, rows: OrderRow[]): Promise<Response> {
  const [products, enquiries, usage] = await Promise.all([loadProducts(req), loadEnquiries(req), usageOf(req, client)])
  const byId = new Map(products.map((p) => [String(p.id), p]))
  const byRow = new Map(matchOrder(rows.filter((r) => r.text), '', products).map((l) => [l.row, l]))
  const month = monthKey()
  const lines: NetworkLine[] = []
  for (const r of rows) {
    const line = byRow.get(r.row)
    const best = line ? [...line.matches].sort((a, b) => b.score - a.score)[0] : undefined
    const product = best ? byId.get(String(best.productId)) : undefined
    if (!line || !product) {
      lines.push({ requested: r.text, product: '', suppliers: [] })
      continue
    }
    const key = productKey(product.id)
    const existing = await req.payload.find({ collection: 'network-reveals', where: { and: [{ client: { equals: client.id } }, { productKey: { equals: key } }] }, limit: 1, depth: 0, overrideAccess: true, req })
    let ids: string[]
    if (existing.docs.length) {
      ids = (((existing.docs[0] as unknown as Doc).suppliers as Doc[]) ?? []).map((x) => idOf(x.supplier))
    } else {
      if (usage.used >= usage.limit) {
        lines.push({ requested: r.text, product: '', suppliers: [], limitReached: true })
        continue
      }
      const candidateIds = new Set(product.sources.map((x) => String(x.supplierId)))
      const docs = candidateIds.size ? await req.payload.find({ collection: 'suppliers', where: { id: { in: [...candidateIds] } }, limit: 0, pagination: false, depth: 0, overrideAccess: true, req }) : { docs: [] }
      const stats = await statsFor(req, candidateIds, enquiries)
      const candidates: Candidate[] = (docs.docs as unknown as Doc[])
        .filter((d) => !['rejected', 'on-hold'].includes(s(d.status)))
        .map((d) => ({ id: String(d.id), name: s(d.name), rating: s(d.rating) || null, email: s(d.email) || null, stats: stats.get(String(d.id)) ?? emptyStats() }))
      ids = rankSuppliers(candidates).slice(0, usage.perProduct).map((c) => c.id)
      if (!ids.length) {
        lines.push({ requested: r.text, product: '', suppliers: [] })
        continue
      }
      await req.payload.create({ collection: 'network-reveals', depth: 0, overrideAccess: true, req, data: { client: client.id, productKey: key, productLabel: product.name, month, suppliers: ids.map((id) => ({ supplier: Number(id) || id })) } as never })
      usage.used++
    }
    const docs = await req.payload.find({ collection: 'suppliers', where: { id: { in: ids } }, limit: 0, pagination: false, depth: 0, overrideAccess: true, req })
    const stats = await statsFor(req, new Set(ids), enquiries)
    const byDoc = new Map((docs.docs as unknown as Doc[]).map((d) => [String(d.id), d]))
    // A supplier we have since put on hold or rejected is not shown again, even on an old reveal.
    const suppliers = ids
      .map((id) => byDoc.get(id))
      .filter((d): d is Doc => Boolean(d) && !['rejected', 'on-hold'].includes(s(d?.status)))
      .map((d) => {
        const src = product.sources.find((x) => String(x.supplierId) === String(d.id))
        return toNetworkSupplier(d, product.name, s(src?.documents), stats.get(String(d.id)) ?? emptyStats())
      })
    lines.push({ requested: r.text, product: product.name, suppliers })
  }
  await req.payload.update({ collection: 'network-clients', id: client.id, depth: 0, overrideAccess: true, req, data: { usedThisMonth: usage.used, usageMonth: month, lastSeenAt: new Date().toISOString() } as never }).catch(() => null)
  return Response.json({ lines, usage })
}

const usageHandler: PayloadHandler = async (req) => {
  const client = await clientOf(req)
  if (!client) return err('Not allowed', 403)
  return Response.json({ usage: await usageOf(req, client), active: Boolean(client.active) })
}

// POST { supplierRef, event, days? }: only about a supplier this client was shown.
const signalHandler: PayloadHandler = async (req) => {
  const client = await clientOf(req)
  if (!client) return err('Not allowed', 403)
  const body = await jsonBody<{ supplierRef?: unknown; event?: unknown; days?: unknown }>(req)
  if (!body) return notJson()
  const ref = s(body.supplierRef).trim()
  const event = s(body.event) as SignalEvent
  if (!/^\d{1,12}$/.test(ref) || !SIGNAL_EVENTS.includes(event) || event === 'shared') return err('Bad signal', 400)
  const shown = await req.payload.count({ collection: 'network-reveals', where: { and: [{ client: { equals: client.id } }, { 'suppliers.supplier': { equals: Number(ref) } }] }, overrideAccess: true, req })
  if (!shown.totalDocs) return err('Unknown supplier', 404)
  const days = typeof body.days === 'number' && Number.isFinite(body.days) ? Math.max(0, Math.min(365, Math.round(body.days * 10) / 10)) : null
  const now = new Date().toISOString()
  // One signal of a kind per supplier and day from one client: repeating it changes nothing.
  const today = await req.payload.count({ collection: 'network-signals', where: { and: [{ client: { equals: client.id } }, { supplier: { equals: Number(ref) } }, { event: { equals: event } }, { at: { greater_than: `${now.slice(0, 10)}T00:00:00.000Z` } }] }, overrideAccess: true, req })
  if (today.totalDocs) return Response.json({ ok: true, repeated: true })
  await req.payload.create({ collection: 'network-signals', depth: 0, overrideAccess: true, req, data: { client: client.id, supplier: Number(ref), event, days, at: now, month: now.slice(0, 7) } as never })
  return Response.json({ ok: true })
}

// POST { name, nameLocal?, country, city?, website?, supplies?, notes? }: a supplier a client chose
// to share. Public facts only; arrives as New, source "Network: <client>", unverified. A supplier
// we already have is not created again and earns no bonus.
const shareHandler: PayloadHandler = async (req) => {
  const client = await clientOf(req)
  if (!client) return err('Not allowed', 403)
  const body = await jsonBody<Record<string, unknown>>(req)
  if (!body) return notJson()
  const name = s(body.name).trim().slice(0, 200)
  const country = s(body.country).trim().slice(0, 80)
  if (name.length < 2 || !country) return err('Name and country are required', 400)
  const supplies = (Array.isArray(body.supplies) ? body.supplies : []).map(s).filter((v) => ['api', 'intermediate', 'excipient', 'colour', 'device', 'consumable', 'other'].includes(v))
  const website = s(body.website).trim().slice(0, 200)
  if (website && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(website)) return err('The website must be a full address starting with http:// or https://', 400)
  const before = await usageOf(req, client)
  if (before.shares >= MAX_SHARES_PER_MONTH) return err(`Up to ${MAX_SHARES_PER_MONTH} suppliers can be shared a month`, 429)
  // The same name in any spelling is one supplier. The answer is the same whether we had it or
  // not, so nobody can test names against our database; only a new one earns the bonus.
  const want = nameKey(name)
  const near = await req.payload.find({ collection: 'suppliers', where: { name: { like: name.split(/\s+/)[0] } }, limit: 200, depth: 0, overrideAccess: true, req })
  const exists = (near.docs as unknown as Doc[]).some((d) => nameKey(s(d.name)) === want)
  if (!exists) {
    const made = await req.payload.create({
      collection: 'suppliers', depth: 0, overrideAccess: true, req,
      data: {
        name, nameLocal: s(body.nameLocal).slice(0, 200), country, city: s(body.city).slice(0, 80), website, supplies, status: 'new',
        source: `Network: ${s(client.name)} (shared ${new Date().toISOString().slice(0, 10)}, unverified)`, notes: s(body.notes).slice(0, 2000),
      } as never,
    })
    const now = new Date().toISOString()
    await req.payload.create({ collection: 'network-signals', depth: 0, overrideAccess: true, req, data: { client: client.id, supplier: made.id, event: 'shared', at: now, month: now.slice(0, 7) } as never })
  }
  const usage = await usageOf(req, client)
  return Response.json({ ok: true, sharesThisMonth: usage.shares, usage })
}

export const networkEndpoints: Endpoint[] = [
  { path: '/network/search', method: 'post', handler: searchHandler },
  { path: '/network/usage', method: 'get', handler: usageHandler },
  { path: '/network/signal', method: 'post', handler: signalHandler },
  { path: '/network/share', method: 'post', handler: shareHandler },
]
