import { timingSafeEqual } from 'node:crypto'

import type { PayloadHandler, PayloadRequest, Where } from 'payload'

// POST /api/products/import: bulk upsert of suppliers, certificates and products from a JSON
// file made from the supplier documents in Drive. The data never enters this public repo.
// Off unless CATALOGUE_IMPORT_TOKEN is set in /opt/njmc/.env; the call is made on the server
// itself (docker exec), with header "Authorization: Import <token>".
//
// Matching: suppliers by name, certificates by supplier + type + number (or + scope when there
// is no number), products by slug.
// Re-running is safe. An existing product keeps its "published" setting, its internal notes and
// its sources from other suppliers; sources from the suppliers in the file are replaced. Every
// other field in the file overwrites what is in the admin.

type SupplierIn = { name: string } & Record<string, unknown>
type CertIn = { supplier: string; type: string; number?: string } & Record<string, unknown>
type SourceIn = { supplier: string; documents?: string; marketStatus?: string; details?: string }
type ProductIn = { slug: string; name: string; published?: boolean; sources?: SourceIn[] } & Record<string, unknown>
type ImportFile = { suppliers?: SupplierIn[]; certificates?: CertIn[]; products?: ProductIn[] }

function authorised(req: PayloadRequest): boolean {
  const token = process.env.CATALOGUE_IMPORT_TOKEN
  if (!token || token.length < 32) return false
  const header = req.headers.get('authorization') ?? ''
  if (!header.startsWith('Import ')) return false
  const given = Buffer.from(header.slice('Import '.length))
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}

export const importCatalogue: PayloadHandler = async (req) => {
  if (!authorised(req)) return Response.json({ error: 'Not found' }, { status: 404 })
  const body = (await req.json?.()) as ImportFile | undefined
  if (!body) return Response.json({ error: 'JSON body required' }, { status: 400 })

  const { payload } = req
  const counts = { suppliersCreated: 0, suppliersUpdated: 0, certificatesCreated: 0, certificatesUpdated: 0, productsCreated: 0, productsUpdated: 0 }
  const supplierIds = new Map<string, number | string>()

  for (const s of body.suppliers ?? []) {
    const found = await payload.find({ collection: 'suppliers', where: { name: { equals: s.name } }, limit: 1, depth: 0 })
    const doc = found.docs[0]
      ? await payload.update({ collection: 'suppliers', id: found.docs[0].id, data: s as never, depth: 0 })
      : await payload.create({ collection: 'suppliers', data: s as never, depth: 0 })
    counts[found.docs[0] ? 'suppliersUpdated' : 'suppliersCreated']++
    supplierIds.set(s.name, doc.id)
  }

  const supplierId = async (name: string) => {
    if (!supplierIds.has(name)) {
      const found = await payload.find({ collection: 'suppliers', where: { name: { equals: name } }, limit: 1, depth: 0 })
      if (!found.docs[0]) throw new Error(`Unknown supplier: ${name}`)
      supplierIds.set(name, found.docs[0].id)
    }
    return supplierIds.get(name)!
  }

  for (const c of body.certificates ?? []) {
    if (!c.number) delete c.number
    if (!c.number && !c.scope) return Response.json({ error: `Certificate without number or scope: ${c.supplier} ${c.type}` }, { status: 400 })
    const id = await supplierId(c.supplier)
    const where: Where = {
      and: [
        { supplier: { equals: id } },
        { type: { equals: c.type } },
        (c.number ? { number: { equals: c.number } } : { and: [{ number: { exists: false } }, { scope: { equals: c.scope } }] }) as Where,
      ],
    }
    const found = await payload.find({ collection: 'supplier-certificates', where, limit: 1, depth: 0 })
    const data = { ...c, supplier: id } as never
    if (found.docs[0]) await payload.update({ collection: 'supplier-certificates', id: found.docs[0].id, data, depth: 0 })
    else await payload.create({ collection: 'supplier-certificates', data, depth: 0 })
    counts[found.docs[0] ? 'certificatesUpdated' : 'certificatesCreated']++
  }

  for (const p of body.products ?? []) {
    const incoming = await Promise.all((p.sources ?? []).map(async (s) => ({ ...s, supplier: await supplierId(s.supplier) })))
    const incomingIds = new Set(incoming.map((s) => s.supplier))
    const found = await payload.find({ collection: 'products', where: { slug: { equals: p.slug } }, limit: 1, depth: 0 })
    const existing = found.docs[0]
    if (existing) {
      const rest: Record<string, unknown> = { ...p }
      delete rest.published
      delete rest.internalNotes
      const kept = (existing.sources ?? [])
        .filter((s) => !incomingIds.has(typeof s.supplier === 'object' ? s.supplier.id : s.supplier))
        .map((s) => ({ supplier: s.supplier, documents: s.documents, marketStatus: s.marketStatus, details: s.details }))
      await payload.update({ collection: 'products', id: existing.id, data: { ...rest, sources: [...kept, ...incoming] } as never, depth: 0 })
      counts.productsUpdated++
    } else {
      await payload.create({ collection: 'products', data: { ...p, sources: incoming } as never, depth: 0 })
      counts.productsCreated++
    }
  }

  return Response.json(counts)
}
