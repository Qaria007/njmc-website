import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionConfig, type PayloadHandler, type PayloadRequest } from 'payload'

import { type CatalogueProduct, matchOrder, type OrderRow } from '../lib/order-match.ts'
import { readOrderWithAi } from '../lib/order-ai.ts'
import { parseOrder, typedToOrder } from '../lib/order-parse.ts'
import { buildOrderTable, orderTableXlsx } from '../lib/order-table.ts'
import { compareQuotes, convert, type QuotedEnquiry, sellPrice } from '../lib/order-desk.ts'
import { emailsIn, parseQuantity } from '../lib/trade-docs.ts'
import { isStaff, signedIn, trashAccess } from './access.ts'
import { ORDERS_DIR } from './OrderFiles.ts'
import { CERT_TYPES, certificateState } from './SupplierCertificates.ts'
import { jsonBody, notJson } from './SupplierOrders.ts'
import { loadAi, loadSeller } from './TradeSettings.ts'
import { networkEnabled, networkSearch } from '../lib/network-client.ts'
import { usageText } from '../lib/network.ts'

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

export async function loadProducts(req: PayloadRequest): Promise<CatalogueProduct[]> {
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
  // The AI's reading is written only here, never taken from the request.
  delete data.fileReading
  // Moving the order to the Trash or back is not an edit: nothing is read or matched again.
  if (data.deletedAt || originalDoc?.deletedAt) return data
  const fileChanged = idOf(data.orderFile as Rel) !== idOf(originalDoc?.orderFile as Rel)
  const typedChanged = (data.typedMaterials ?? '') !== (originalDoc?.typedMaterials ?? '')
  if (!data.rematch && !fileChanged && !typedChanged) return data

  const notes: string[] = []
  let rows: OrderRow[] = []
  let text = ''
  const fileId = idOf(data.orderFile as Rel)
  if (fileId) {
    const f = await req.payload.findByID({ collection: 'order-files', id: fileId, depth: 0, req, overrideAccess: true, trash: true })
    const name = path.basename(String(f.filename))
    const full = path.resolve(ORDERS_DIR, name)
    try {
      if (!full.startsWith(ORDERS_DIR + path.sep)) throw new Error('invalid file name')
      if ((f.filesize ?? 0) > 10_000_000) throw new Error('file is larger than 10 MB')
      const buf = await readFile(full)
      let parsed = await parseOrder(buf, name, String(f.mimeType ?? ''))
      if (parsed.needsAi) {
        // A photo or a scan: the AI's reading is kept with the order, so saving again does not pay for a second reading.
        const kept = originalDoc?.fileReading
        const key = `${fileId}:${f.filename}:${f.filesize}`
        if (kept?.key === key && Array.isArray(kept.parsed?.rows)) parsed = kept.parsed
        else {
          const ai = await loadAi(req.payload, req)
          if (ai) {
            parsed = await readOrderWithAi(ai, buf, name)
            if (parsed.rows.length) data.fileReading = { key, parsed }
          }
        }
      }
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

  // The supplier network (company installations only): NJMC's database answers for the materials
  // without a supplier of our own (or every material), within the plan's caps. A failure is a note.
  const mode = String(data.networkSearch ?? originalDoc?.networkSearch ?? 'missing')
  if (networkEnabled() && mode !== 'off' && data.lines.length) {
    const want = (data.lines as { supplierCount: number }[]).map((l, i) => i).filter((i) => mode === 'all' || data.lines[i].supplierCount === 0)
    if (want.length) {
      try {
        const r = await networkSearch(want.map((i) => ({ requested: data.lines[i].requested, cas: data.lines[i].cas, grade: data.lines[i].grade, quantity: data.lines[i].quantity })))
        want.forEach((i, j) => {
          const nl = r.lines[j]
          data.lines[i].network = (nl?.suppliers ?? []).map((x) => ({ ...x }))
          data.lines[i].networkNote = nl?.limitReached ? 'monthly limit reached' : ''
        })
        data.networkUsage = usageText(r.usage)
        if (r.lines.some((l) => l.limitReached)) notes.push('supplier network: the monthly limit of product searches is reached (shown on the order)')
      } catch (e) {
        data.networkUsage = `Supplier network: ${(e as Error).message}`
        notes.push(`supplier network: ${(e as Error).message}`)
      }
    }
  }

  const found = data.lines.filter((l: { supplierCount: number; network?: unknown[] }) => l.supplierCount > 0 || (l.network?.length ?? 0) > 0)
  data.results = `${found.length} of ${data.lines.length} requested materials have at least one supplier${networkEnabled() ? ' (yours or from the network)' : ' in the database'}. See the table below, or download the Excel.${data.networkUsage ? ` ${data.networkUsage}` : ''}`
  data.readNote = notes.join(' | ') || 'Nothing to read: attach an order file or type the materials.'
  data.matchedAt = new Date().toISOString()
  data.rematch = false
  return data
}

// Moving an order to the Trash: refused once real work hangs on it (an enquiry or purchase order
// that was sent, a proforma invoice past draft, a payment), because those records point to it.
// Its uploaded file goes to the Trash with it, and comes back with it, unless another order uses it.
type Doc = Record<string, unknown> & { id: number | string }
const str = (v: unknown) => (v == null ? '' : String(v))

const trashGuard: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (operation !== 'update' || !originalDoc) return data
  const trashing = data.deletedAt != null && !originalDoc.deletedAt
  const restoring = data.deletedAt === null && Boolean(originalDoc.deletedAt)
  if (!trashing && !restoring) return data
  const id = originalDoc.id
  if (trashing) {
    const linked = async (collection: string) =>
      (await req.payload.find({ collection: collection as never, where: { order: { equals: id } }, limit: 500, depth: 0, pagination: false, overrideAccess: true, req })).docs as unknown as Doc[]
    const [enquiries, sales, payments] = await Promise.all([linked('supplier-orders'), linked('buyer-documents'), linked('payments')])
    const sent = enquiries.filter((e) => !['draft', 'cancelled'].includes(str(e.status)) || e.sentAt)
    const pis = sales.filter((d) => !['draft', 'cancelled'].includes(str(d.status)))
    const why = [
      sent.length ? `${sent.length} enquiry or purchase order sent (${sent.map((e) => str(e.number)).join(', ')})` : '',
      pis.length ? `${pis.length} proforma invoice past draft (${pis.map((d) => str(d.piNumber)).join(', ')})` : '',
      payments.length ? `${payments.length} payment` : '',
    ].filter(Boolean)
    if (why.length) throw new APIError(`This order cannot be deleted: it already has ${why.join(', ')}. Set its status to "lost" instead.`, 400, undefined, true)
  }
  const fileId = idOf(originalDoc.orderFile as Rel)
  if (fileId) {
    const others = await req.payload.count({ collection: 'order-matches', where: { and: [{ orderFile: { equals: fileId } }, { id: { not_equals: id } }] }, overrideAccess: true, req })
    if (!others.totalDocs) {
      await req.payload
        .update({ collection: 'order-files', id: fileId, trash: true, depth: 0, overrideAccess: true, req, context: { withOrder: true }, data: { deletedAt: trashing ? new Date().toISOString() : null } as never })
    }
  }
  return data
}

// Deleting for good only from the Trash, where the check above has already been made.
const onlyFromTrash: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const doc = (await req.payload.findByID({ collection: 'order-matches', id, depth: 0, overrideAccess: true, trash: true, req })) as unknown as Doc
  if (!doc.deletedAt) throw new APIError('Move the order to the Trash first (Delete without "delete permanently"); it can be deleted for good from the Trash.', 400, undefined, true)
}

// Table data and Excel download for one order (signed-in admins only).
const tableEndpoint: PayloadHandler = async (req) => {
  if (!isStaff(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  return Response.json(await buildOrderTable(req.payload, String(req.routeParams?.id), req))
}
const xlsxEndpoint: PayloadHandler = async (req) => {
  if (!isStaff(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
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

// Enquiries, purchase orders and buyer documents for one order (signed-in admins only).

async function supplierOrdersOf(req: PayloadRequest, orderId: string) {
  const res = await req.payload.find({ collection: 'supplier-orders', where: { order: { equals: orderId } }, limit: 500, depth: 0, pagination: false, sort: 'createdAt', overrideAccess: true, req })
  return res.docs as unknown as Doc[]
}

// GET: every supplier found for this order with its materials and email, plus what already exists.
const tradeEndpoint: PayloadHandler = async (req) => {
  if (!isStaff(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const id = String(req.routeParams?.id)
  const t = await buildOrderTable(req.payload, id, req)
  const existing = await supplierOrdersOf(req, id)
  const by = new Map<string, typeof t.rows>()
  for (const r of t.rows.filter((x) => x.found)) by.set(r.supplierId, [...(by.get(r.supplierId) ?? []), r])
  const mine = (supplierId: string) => existing.filter((o) => String(idOf(o.supplier as Rel)) === supplierId && o.status !== 'cancelled')
  const suppliers = [...by].map(([supplierId, rows]) => ({
    supplierId,
    supplier: rows[0].supplier,
    // Where the email will really go: the address stored on the enquiry once it exists, else the supplier record.
    emails: emailsIn(mine(supplierId).find((o) => o.kind === 'rfq')?.toEmail ?? rows[0].email),
    phone: rows[0].phone,
    wechat: rows[0].wechat,
    materials: rows.map((r) => `${r.requested}${r.quantity ? ` (${r.quantity})` : ''}`),
    orders: mine(supplierId).map((o) => ({ id: o.id, number: o.number, kind: o.kind, status: o.status, sentAt: o.sentAt ?? null })),
  }))
  const buyer = await req.payload.find({ collection: 'buyer-documents', where: { order: { equals: id } }, limit: 50, depth: 0, pagination: false, overrideAccess: true, req })
  return Response.json({
    suppliers: suppliers.sort((a, b) => b.materials.length - a.materials.length),
    buyerDocuments: (buyer.docs as unknown as Doc[]).map((d) => ({ id: d.id, piNumber: d.piNumber, status: d.status })),
  })
}

// POST { supplierIds: [...] }: a draft enquiry for each of these suppliers with the materials matched
// to it. A supplier that already has an enquiry for this order keeps it (no second one). Nothing is sent here.
const enquiriesEndpoint: PayloadHandler = async (req) => {
  if (!isStaff(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const id = String(req.routeParams?.id)
  const body = await jsonBody<{ supplierIds?: unknown[] }>(req)
  if (!body) return notJson()
  const wanted = new Set((Array.isArray(body.supplierIds) ? body.supplierIds : []).map(String))
  if (!wanted.size) return Response.json({ error: 'Choose at least one supplier' }, { status: 400 })
  const t = await buildOrderTable(req.payload, id, req)
  const existing = await supplierOrdersOf(req, id)
  const out: { supplierId: string; id: number | string; number: string; created: boolean }[] = []
  for (const supplierId of wanted) {
    const rows = t.rows.filter((r) => r.found && r.supplierId === supplierId)
    if (!rows.length) continue
    // A network supplier becomes one of our own suppliers first (name, country, contacts, and the
    // reference that lets the network learn how they behave), then gets the enquiry like any other.
    const localId = supplierId.startsWith('net:') ? await localSupplierFor(req, id, supplierId.slice(4)) : supplierId
    if (!localId) continue
    const has = existing.find((o) => String(idOf(o.supplier as Rel)) === localId && o.kind === 'rfq' && o.status !== 'cancelled')
    if (has) {
      out.push({ supplierId, id: has.id, number: str(has.number), created: false })
      continue
    }
    const made = (await req.payload.create({
      collection: 'supplier-orders', depth: 0, overrideAccess: true, req,
      data: {
        kind: 'rfq', status: 'draft', supplier: Number(localId) || localId, order: Number(id) || id,
        items: rows.map((r) => {
          const q = parseQuantity(r.quantity)
          // A sure match is asked for under the supplier's own product name (customer spelling can be off);
          // a "(check)" match keeps the customer's wording so the supplier sees what is really wanted.
          const sure = r.product && r.match.includes('check') === false && r.product.includes(';') === false
          return { material: sure ? r.product : r.requested, requested: r.requested, spec: r.grade, quantity: q.quantity, unit: q.unit || 'kg', supplierProduct: r.product, note: q.quantity == null && r.quantity ? `Quantity: ${r.quantity}` : '' }
        }),
      } as never,
    })) as unknown as Doc
    out.push({ supplierId, id: made.id, number: str(made.number), created: true })
  }
  return Response.json({ orders: out })
}

// The supplier record for a network supplier shown on this order: found by its network reference,
// or made from the facts the network gave (source "Supplier network").
async function localSupplierFor(req: PayloadRequest, orderId: string, ref: string): Promise<string | null> {
  const have = await req.payload.find({ collection: 'suppliers', where: { networkRef: { equals: ref } }, limit: 1, depth: 0, overrideAccess: true, req })
  if (have.docs.length) return String(have.docs[0].id)
  const order = (await req.payload.findByID({ collection: 'order-matches', id: orderId, depth: 0, overrideAccess: true, trash: true, req })) as unknown as Doc
  const n = ((order.lines as Doc[]) ?? []).flatMap((l) => (l.network as Doc[]) ?? []).find((x) => str(x.ref) === ref)
  if (!n) return null
  const sameName = await req.payload.find({ collection: 'suppliers', where: { name: { equals: str(n.name) } }, limit: 1, depth: 0, overrideAccess: true, req })
  if (sameName.docs.length) {
    await req.payload.update({ collection: 'suppliers', id: sameName.docs[0].id, depth: 0, overrideAccess: true, req, data: { networkRef: ref } as never })
    return String(sameName.docs[0].id)
  }
  const made = await req.payload.create({
    collection: 'suppliers', depth: 0, overrideAccess: true, req,
    data: {
      name: str(n.name), country: str(n.country) || 'China', city: str(n.city), website: str(n.website), email: str(n.email), phone: str(n.phone), wechat: str(n.wechat),
      status: 'new', source: `Supplier network (${new Date().toISOString().slice(0, 10)})`, networkRef: ref,
    } as never,
  })
  return String(made.id)
}

// POST: one buyer-documents record for this order (PI, invoice, packing list), items pre-filled.
const buyerDocsEndpoint: PayloadHandler = async (req) => {
  if (!isStaff(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  if (!(await jsonBody(req))) return notJson()
  const id = String(req.routeParams?.id)
  const order = (await req.payload.findByID({ collection: 'order-matches', id, depth: 0, overrideAccess: true, req })) as unknown as Doc
  const seller = await loadSeller(req.payload, req)
  const made = (await req.payload.create({
    collection: 'buyer-documents', depth: 0, overrideAccess: true, req,
    data: {
      buyerName: str(order.customer) || str(order.title), ...(idOf(order.client as Rel) ? { client: idOf(order.client as Rel) } : {}), order: Number(id) || id, paymentTerms: seller.buyerPaymentTerms,
      items: ((order.lines as Doc[]) ?? []).map((l) => {
        const q = parseQuantity(l.quantity)
        return { description: str(l.requested), spec: str(l.grade), quantity: q.quantity, unit: q.unit || 'kg', origin: 'China' }
      }),
    } as never,
  })) as unknown as Doc
  return Response.json({ id: made.id, piNumber: made.piNumber })
}

// The prices suppliers sent for this order, per order line, cheapest first in the chosen currency.
async function quotesFor(req: PayloadRequest, id: string, currency: string) {
  const order = (await req.payload.findByID({ collection: 'order-matches', id, depth: 0, overrideAccess: true, req })) as unknown as Doc
  const rfqs = await req.payload.find({ collection: 'supplier-orders', where: { and: [{ order: { equals: id } }, { kind: { equals: 'rfq' } }] }, limit: 500, depth: 1, pagination: false, overrideAccess: true, req })
  const enquiries: QuotedEnquiry[] = (rfqs.docs as unknown as Doc[]).map((e) => ({
    id: e.id, number: str(e.number), supplierId: String(idOf(e.supplier as Rel)), supplier: e.supplier && typeof e.supplier === 'object' ? str((e.supplier as Doc).name) : '',
    status: str(e.status), currency: str(e.quoteCurrency) || str(e.currency), incoterm: str(e.quoteIncoterm) || str(e.incoterm), incotermPlace: str(e.quoteIncotermPlace) || str(e.incotermPlace),
    quoteValidUntil: str(e.quoteValidUntil), quoteReceivedAt: str(e.quoteReceivedAt), items: (e.items as never) ?? [],
  }))
  const seller = await loadSeller(req.payload, req)
  const lines = compareQuotes(((order.lines as Doc[]) ?? []).map((l) => ({ requested: str(l.requested), quantity: str(l.quantity) })), enquiries, currency, seller.rates)
  return { order, enquiries, lines, seller }
}

const CURRENCY = /^(USD|CNY|EUR)$/

// GET ?currency=USD: the comparison table for the panel on the order.
const quotesEndpoint: PayloadHandler = async (req) => {
  if (!isStaff(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const q = (req.query ?? {}) as Record<string, unknown>
  const currency = CURRENCY.test(str(q.currency)) ? str(q.currency) : 'USD'
  const { order, enquiries, lines, seller } = await quotesFor(req, String(req.routeParams?.id), currency)
  return Response.json({
    currency, defaultMargin: seller.defaultMargin, rates: seller.rates, client: idOf(order.client as Rel) ?? null,
    enquiries: enquiries.map((e) => ({ id: e.id, number: e.number, supplier: e.supplier, status: e.status, answered: str(e.quoteReceivedAt).slice(0, 10) })),
    lines,
  })
}

// POST { currency, client?, lines: [{ rfqId, itemId, margin, requested }] }: a draft proforma invoice
// with one item per chosen price, selling price = cost converted to the PI currency plus the margin.
// The cost and the supplier are kept on each item (never printed) for the profit figures.
const makePiEndpoint: PayloadHandler = async (req) => {
  if (!isStaff(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const body = await jsonBody<{ currency?: string; client?: number | string | null; lines?: { rfqId?: unknown; itemId?: unknown; margin?: unknown; requested?: unknown }[] }>(req)
  if (!body) return notJson()
  const currency = CURRENCY.test(str(body.currency)) ? str(body.currency) : 'USD'
  const picks = Array.isArray(body.lines) ? body.lines.slice(0, 500) : []
  if (!picks.length) return Response.json({ error: 'Choose at least one price' }, { status: 400 })
  const id = String(req.routeParams?.id)
  const { order, enquiries, lines, seller } = await quotesFor(req, id, currency)
  const items = []
  for (const p of picks) {
    const e = enquiries.find((x) => String(x.id) === str(p.rfqId))
    const i = e?.items.find((x) => str(x.id) === str(p.itemId))
    const margin = Number(p.margin)
    if (!e || !i || i.quotedPrice == null) return Response.json({ error: 'A chosen price no longer exists: reload the page' }, { status: 400 })
    if (!Number.isFinite(margin) || margin < 0 || margin > 1000) return Response.json({ error: `The markup for ${i.material} is not a number` }, { status: 400 })
    const cost = convert(i.quotedPrice, e.currency, currency, seller.rates)
    if (cost == null) return Response.json({ error: `No exchange rate for ${e.currency} to ${currency}: fill it in under Orders, Company details for documents` }, { status: 400 })
    const line = lines.find((l) => l.options.some((o) => String(o.rfqId) === String(e.id) && o.itemId === str(i.id)))
    const quantity = i.quantity ?? parseQuantity(line?.quantity).quantity
    items.push({
      description: str(p.requested) || line?.requested || i.material, spec: str(i.spec), quantity, unit: str(i.unit) || 'kg', origin: 'China',
      unitPrice: sellPrice(cost, margin), costPrice: cost, costSupplier: Number(e.supplierId) || e.supplierId,
      costNote: `${e.number}: ${e.currency || 'USD'} ${i.quotedPrice} per ${str(i.unit) || 'unit'}${e.currency && e.currency !== currency ? ` (= ${currency} ${cost})` : ''}, markup ${margin}% on cost`,
    })
  }
  const clientId = body.client ?? idOf(order.client as Rel) ?? null
  const made = (await req.payload.create({
    collection: 'buyer-documents', depth: 0, overrideAccess: true, req,
    data: {
      buyerName: str(order.customer) || str(order.title), ...(clientId ? { client: clientId } : {}), order: Number(id) || id, currency, paymentTerms: seller.buyerPaymentTerms || undefined,
      items,
    } as never,
  })) as unknown as Doc
  if (order.status === 'new' || order.status === 'suppliers contacted') await req.payload.update({ collection: 'order-matches', id, depth: 0, overrideAccess: true, req, data: { status: 'quoted' } as never })
  return Response.json({ id: made.id, piNumber: made.piNumber })
}

// Order matching: upload a customer order and get every supplier in the Catalogue database for each
// material. Private (customer data).
export const OrderMatches: CollectionConfig = {
  slug: 'order-matches',
  labels: { singular: 'Customer order', plural: 'Customer orders' },
  admin: {
    group: 'Orders',
    useAsTitle: 'title',
    defaultColumns: ['title', 'customer', 'status', 'matchedAt'],
    description: 'Attach a customer order (Excel, CSV, Word, PDF or a photo) or type the materials, then Save. The suppliers table appears below, with an Excel download. Uploaded by mistake? Delete it: it goes to the Trash and can be restored from there.',
  },
  // Delete moves the order to the Trash (staff and owner); only the owner deletes it from the Trash for good.
  trash: true,
  access: { read: signedIn, create: signedIn, update: signedIn, delete: trashAccess },
  hooks: { beforeChange: [trashGuard, findSuppliers], beforeDelete: [onlyFromTrash] },
  endpoints: [
    { path: '/:id/table', method: 'get', handler: tableEndpoint },
    { path: '/:id/xlsx', method: 'get', handler: xlsxEndpoint },
    { path: '/:id/trade', method: 'get', handler: tradeEndpoint },
    { path: '/:id/enquiries', method: 'post', handler: enquiriesEndpoint },
    { path: '/:id/buyer-documents', method: 'post', handler: buyerDocsEndpoint },
    { path: '/:id/quotes', method: 'get', handler: quotesEndpoint },
    { path: '/:id/make-pi', method: 'post', handler: makePiEndpoint },
  ],
  timestamps: true,
  fields: [
    { name: 'timeline', type: 'ui', admin: { components: { Field: '/components/admin/OrderTimeline#OrderTimeline' } } },
    { name: 'title', type: 'text', required: true, admin: { description: 'e.g. customer name + date' } },
    {
      type: 'row',
      fields: [
        { name: 'customer', type: 'text' },
        { name: 'client', type: 'relationship', relationTo: 'clients', admin: { description: 'The client record, used for the proforma invoice' } },
        {
          name: 'status',
          type: 'select',
          defaultValue: 'new',
          options: ['new', 'suppliers contacted', 'quoted', 'won', 'lost'].map((v) => ({ label: v, value: v })),
        },
      ],
    },
    { name: 'orderFile', type: 'upload', relationTo: 'order-files', admin: { description: 'Excel, CSV, Word, PDF, .txt, or a photo or scan (JPG, PNG): photos and scans are read by the AI when AI mode is on in Company details' } },
    // The AI's reading of a photo or scan, kept so the same file is not read (and paid for) twice.
    { name: 'fileReading', type: 'json', admin: { hidden: true }, hooks: { beforeDuplicate: [() => null] } },
    { name: 'typedMaterials', label: 'Materials (typed)', type: 'textarea', admin: { description: 'Optional: one material per line, e.g. "Mesalazine EP 500 kg" or a CAS number' } },
    { name: 'rematch', label: 'Find suppliers again when I save', type: 'checkbox', defaultValue: true, admin: { position: 'sidebar' } },
    {
      name: 'networkSearch', type: 'select', defaultValue: 'missing', label: 'Supplier network',
      admin: { position: 'sidebar', hidden: !networkEnabled(), description: 'Each product searched counts once a month; a product searched again shows the same suppliers.' },
      options: [
        { label: 'Search it for materials without a supplier of mine', value: 'missing' },
        { label: 'Search it for every material', value: 'all' },
        { label: 'Do not search it', value: 'off' },
      ],
    },
    { name: 'networkUsage', type: 'text', admin: { hidden: true } },
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
        {
          // Suppliers the network showed for this material (company installations only).
          name: 'network',
          type: 'array',
          fields: [
            { type: 'row', fields: [{ name: 'ref', type: 'text' }, { name: 'name', type: 'text' }, { name: 'country', type: 'text' }, { name: 'city', type: 'text' }] },
            { type: 'row', fields: [{ name: 'website', type: 'text' }, { name: 'email', type: 'text' }, { name: 'phone', type: 'text' }, { name: 'wechat', type: 'text' }] },
            { type: 'row', fields: [{ name: 'listedAs', type: 'text' }, { name: 'documents', type: 'text' }, { name: 'standing', type: 'text' }] },
          ],
        },
        { name: 'networkNote', type: 'text' },
      ],
    },
    { name: 'notes', type: 'textarea' },
    { name: 'documents', type: 'join', collection: 'trade-files', on: 'order', admin: { defaultColumns: ['filename', 'kind', 'client', 'supplier', 'date'] } },
  ],
}
