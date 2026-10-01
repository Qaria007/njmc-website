import { readFile } from 'node:fs/promises'
import path from 'node:path'

import type { CollectionBeforeChangeHook, CollectionConfig, PayloadHandler, PayloadRequest } from 'payload'

import { type CatalogueProduct, matchOrder, type OrderRow } from '../lib/order-match.ts'
import { parseOrder, typedToOrder } from '../lib/order-parse.ts'
import { buildOrderTable, orderTableXlsx } from '../lib/order-table.ts'
import { signedIn } from './access.ts'
import { ORDERS_DIR } from './OrderFiles.ts'
import { CERT_TYPES, certificateState } from './SupplierCertificates.ts'

type Rel = number | string | { id: number | string; name?: string } | null | undefined
const idOf = (r: Rel) => (r && typeof r === 'object' ? r.id : r)

// Short certificate picture per supplier, grouped: "China drug manufacturing licence valid to 2029-09-29;
// China GMP certificate (old format) EXPIRED; CEP x5; US DMF x3".
const day = (v: unknown) => new Date(new Date(String(v)).getTime() + 12 * 3600_000).toISOString().slice(0, 10)

async function certificateSummaries(req: PayloadRequest): Promise<Map<string, string>> {
  const res = await req.payload.find({ collection: 'supplier-certificates', limit: 5000, depth: 0, pagination: false, req, overrideAccess: true })
  const order = ['cn-dml', 'eu-gmp', 'us-fda', 'who-gmp', 'cn-gmp', 'cep', 'us-dmf', 'wc', 'ipec-gmp', 'iso-9001', 'iso-13485', 'fssc-22000', 'iso-22000', 'business-licence', 'other']
  const by = new Map<string, Map<string, string[]>>()
  for (const c of res.docs) {
    const k = String(idOf(c.supplier as Rel))
    const t = String(c.type)
    const state = certificateState(c.validUntil as string | null)
    const text = state === 'No expiry date' ? '' : state === 'Valid' ? `valid to ${day(c.validUntil)}` : state
    const m = by.get(k) || new Map<string, string[]>()
    m.set(t, [...(m.get(t) || []), text])
    by.set(k, m)
  }
  const out = new Map<string, string>()
  for (const [k, m] of by) {
    const parts = [...m]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([t, states]) => {
        const label = CERT_TYPES.find((x) => x.value === t)?.label ?? t
        const dated = states.filter(Boolean)
        const count = states.length > 1 ? ` x${states.length}` : ''
        return dated.length ? `${label}${count} (${[...new Set(dated)].join(', ')})` : `${label}${count}`
      })
    out.set(k, parts.join('; '))
  }
  return out
}

async function loadProducts(req: PayloadRequest): Promise<CatalogueProduct[]> {
  const res = await req.payload.find({ collection: 'products', limit: 10000, depth: 1, pagination: false, req, overrideAccess: true })
  return res.docs.map((p) => ({
    id: p.id,
    name: p.name,
    otherNames: p.otherNames,
    cas: p.cas,
    grades: p.grades as string[] | null,
    sources: (p.sources || []).map((s) => {
      const sup = s.supplier as Rel
      return {
        supplierId: idOf(sup) as number,
        supplierName: sup && typeof sup === 'object' ? String(sup.name ?? sup.id) : String(sup),
        documents: s.documents,
        marketStatus: s.marketStatus,
      }
    }),
  }))
}

const findSuppliers: CollectionBeforeChangeHook = async ({ data, req, originalDoc }) => {
  const fileChanged = idOf(data.orderFile as Rel) !== idOf(originalDoc?.orderFile as Rel)
  const typedChanged = (data.typedMaterials ?? '') !== (originalDoc?.typedMaterials ?? '')
  if (!data.rematch && !fileChanged && !typedChanged) return data

  const notes: string[] = []
  let rows: OrderRow[] = []
  let text = ''
  const fileId = idOf(data.orderFile as Rel)
  if (fileId) {
    const f = await req.payload.findByID({ collection: 'order-files', id: fileId, depth: 0, req, overrideAccess: true })
    const name = path.basename(String(f.filename))
    const full = path.resolve(ORDERS_DIR, name)
    try {
      if (!full.startsWith(ORDERS_DIR + path.sep)) throw new Error('invalid file name')
      if ((f.filesize ?? 0) > 10_000_000) throw new Error('file is larger than 10 MB')
      const parsed = await parseOrder(await readFile(full), name, String(f.mimeType ?? ''))
      rows = rows.concat(parsed.rows)
      text += `\n${parsed.text}`
      notes.push(`${f.filename}: ${parsed.note}`)
    } catch (e) {
      const msg = (e as NodeJS.ErrnoException).code === 'ENOENT' ? 'file not found on the server' : (e as Error).message
      notes.push(`${name}: could not be read (${msg})`)
    }
  }
  if (data.typedMaterials?.trim()) {
    const typed = typedToOrder(data.typedMaterials)
    rows = rows.concat(typed.rows)
    text += `\n${typed.text}`
    notes.push(typed.note)
  }

  const products = await loadProducts(req)
  const byId = new Map(products.map((p) => [String(p.id), p]))
  const certs = await certificateSummaries(req)
  const lines = matchOrder(rows, text, products)

  data.lines = lines.map((l) => {
    const matches = l.matches.flatMap((m) =>
      (byId.get(String(m.productId))?.sources ?? []).map((s) => ({
        product: m.productId,
        supplier: s.supplierId,
        matchedOn: m.how,
        documents: s.documents || '',
        certificates: certs.get(String(s.supplierId)) || 'no certificates on file',
      })),
    )
    return { requested: l.requested, cas: l.cas, grade: l.grade, quantity: l.quantity, supplierCount: new Set(matches.map((m) => m.supplier)).size, matches }
  })

  const found = data.lines.filter((l: { supplierCount: number }) => l.supplierCount > 0)
  data.results = `${found.length} of ${data.lines.length} requested materials have at least one supplier in the database. See the table below, or download the Excel.`
  data.readNote = notes.join(' | ') || 'Nothing to read: attach an order file or type the materials.'
  data.matchedAt = new Date().toISOString()
  data.rematch = false
  return data
}

// Table data and Excel download for one order (signed-in admins only).
const tableEndpoint: PayloadHandler = async (req) => {
  if (req.user?.collection !== 'users') return Response.json({ error: 'Not allowed' }, { status: 403 })
  return Response.json(await buildOrderTable(req.payload, String(req.routeParams?.id), req))
}
const xlsxEndpoint: PayloadHandler = async (req) => {
  if (req.user?.collection !== 'users') return Response.json({ error: 'Not allowed' }, { status: 403 })
  const t = await buildOrderTable(req.payload, String(req.routeParams?.id), req)
  const name = `Suppliers - ${t.title || 'order'}`.replace(/[^A-Za-z0-9 _.-]+/g, ' ').trim().slice(0, 80)
  return new Response(new Uint8Array(await orderTableXlsx(t)), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}

// Order matching: upload a customer order and get every supplier in the Catalogue database for each
// material. Private (customer data).
export const OrderMatches: CollectionConfig = {
  slug: 'order-matches',
  labels: { singular: 'Order matching', plural: 'Order matching' },
  admin: {
    group: 'Catalogue',
    useAsTitle: 'title',
    defaultColumns: ['title', 'customer', 'status', 'matchedAt'],
    description: 'Attach a customer order (Excel, CSV, Word, PDF) or type the materials, then Save. The suppliers table appears below, with an Excel download.',
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  hooks: { beforeChange: [findSuppliers] },
  endpoints: [
    { path: '/:id/table', method: 'get', handler: tableEndpoint },
    { path: '/:id/xlsx', method: 'get', handler: xlsxEndpoint },
  ],
  timestamps: true,
  fields: [
    { name: 'title', type: 'text', required: true, admin: { description: 'e.g. customer name + date' } },
    {
      type: 'row',
      fields: [
        { name: 'customer', type: 'text' },
        {
          name: 'status',
          type: 'select',
          defaultValue: 'new',
          options: ['new', 'suppliers contacted', 'quoted', 'won', 'lost'].map((v) => ({ label: v, value: v })),
        },
      ],
    },
    { name: 'orderFile', type: 'upload', relationTo: 'order-files', admin: { description: 'Excel, CSV, Word, PDF (with text) or .txt' } },
    { name: 'typedMaterials', label: 'Materials (typed)', type: 'textarea', admin: { description: 'Optional: one material per line, e.g. "Mesalazine EP 500 kg" or a CAS number' } },
    { name: 'rematch', label: 'Find suppliers again when I save', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    { name: 'matchedAt', type: 'date', admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
    { name: 'readNote', label: 'What was read', type: 'text', admin: { readOnly: true } },
    { name: 'results', label: 'Summary', type: 'textarea', admin: { readOnly: true, rows: 2 } },
    { name: 'resultsTable', type: 'ui', admin: { components: { Field: '/components/admin/OrderResults#OrderResults' } } },
    {
      name: 'lines',
      label: 'Results (detail)',
      type: 'array',
      // Shown through the table above; kept as data for the table and the Excel export.
      admin: { readOnly: true, initCollapsed: true, hidden: true },
      fields: [
        { name: 'requested', type: 'text' },
        {
          type: 'row',
          fields: [
            { name: 'cas', type: 'text' },
            { name: 'grade', type: 'text' },
            { name: 'quantity', type: 'text' },
            { name: 'supplierCount', type: 'number' },
          ],
        },
        {
          name: 'matches',
          type: 'array',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'supplier', type: 'relationship', relationTo: 'suppliers' },
                { name: 'product', type: 'relationship', relationTo: 'products' },
                { name: 'matchedOn', type: 'text' },
              ],
            },
            { name: 'documents', type: 'text' },
            { name: 'certificates', type: 'textarea' },
          ],
        },
      ],
    },
    { name: 'notes', type: 'textarea' },
  ],
}
