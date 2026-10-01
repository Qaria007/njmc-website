// Builds the Order matching result as a flat table (one row per material + supplier) for the admin
// table view and the Excel download. Supplier contact details are read live from the Suppliers
// collection, so the table always shows the current phone, email and WeChat.
import ExcelJS from 'exceljs'
import type { Payload, PayloadRequest } from 'payload'

export type TableRow = {
  no: number
  requested: string
  quantity: string
  grade: string
  supplierId: string
  supplier: string
  country: string
  city: string
  product: string
  gradesListed: string
  match: string
  contactPerson: string
  phone: string
  email: string
  wechat: string
  website: string
  documents: string
  toConfirm: string
  found: boolean
}

export type OrderTable = { title: string; customer: string; summary: string; rows: TableRow[] }

type AnyDoc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const idOf = (r: unknown) => (r && typeof r === 'object' ? (r as AnyDoc).id : (r as number | string))

const ASK_ALL = 'Availability, price, MOQ, lead time; grade/pharmacopoeia; CoA; DMF / CEP / GMP status'

export async function buildOrderTable(payload: Payload, id: string | number, req?: PayloadRequest): Promise<OrderTable> {
  const doc = (await payload.findByID({ collection: 'order-matches', id, depth: 0, overrideAccess: true, req })) as unknown as AnyDoc
  const lines = (doc.lines as AnyDoc[] | undefined) ?? []
  const supIds = [...new Set(lines.flatMap((l) => ((l.matches as AnyDoc[]) ?? []).map((m) => idOf(m.supplier))))].filter(Boolean)
  const prodIds = [...new Set(lines.flatMap((l) => ((l.matches as AnyDoc[]) ?? []).map((m) => idOf(m.product))))].filter(Boolean)
  const sup = new Map<string, AnyDoc>()
  const prod = new Map<string, AnyDoc>()
  if (supIds.length) {
    const r = await payload.find({ collection: 'suppliers', where: { id: { in: supIds } }, limit: 5000, depth: 0, pagination: false, overrideAccess: true, req })
    for (const d of r.docs as unknown as AnyDoc[]) sup.set(String(d.id), d)
  }
  if (prodIds.length) {
    const r = await payload.find({ collection: 'products', where: { id: { in: prodIds } }, limit: 10000, depth: 0, pagination: false, overrideAccess: true, req })
    for (const d of r.docs as unknown as AnyDoc[]) prod.set(String(d.id), d)
  }

  const rows: TableRow[] = []
  lines.forEach((l, i) => {
    const base = { no: i + 1, requested: s(l.requested), quantity: s(l.quantity), grade: s(l.grade) }
    const matches = (l.matches as AnyDoc[]) ?? []
    if (!matches.length) {
      rows.push({ ...base, supplierId: '', supplier: 'No supplier in the database yet', country: '', city: '', product: '', gradesListed: '', match: '', contactPerson: '',
        phone: '', email: '', wechat: '', website: '', documents: '', toConfirm: '', found: false })
      return
    }
    // One row per supplier for this material: the strongest match, with every product name they list.
    const RANK = ['CAS number', 'name', 'other name', 'synonym (check)', 'close spelling (check)', 'name inside a longer name (check)', 'same molecule, other salt or form (check)']
    const bySup = new Map<string, AnyDoc[]>()
    for (const m of matches) bySup.set(String(idOf(m.supplier)), [...(bySup.get(String(idOf(m.supplier))) ?? []), m])
    const groups = [...bySup.values()].map((ms) => ms.sort((x, y) => RANK.indexOf(s(x.matchedOn)) - RANK.indexOf(s(y.matchedOn))))
    groups.sort((x, y) => RANK.indexOf(s(x[0].matchedOn)) - RANK.indexOf(s(y[0].matchedOn)))
    for (const ms of groups) {
      const m = ms[0]
      const su = sup.get(String(idOf(m.supplier)))
      const ps = [...new Set(ms.map((x) => String(idOf(x.product))))].map((pid) => prod.get(pid)).filter(Boolean) as AnyDoc[]
      const docs = [...new Set(ms.map((x) => s(x.documents)).filter((d) => d && !/^none/i.test(d)))].join('; ')
      rows.push({
        ...base,
        supplierId: String(idOf(m.supplier)),
        supplier: s(su?.name) || `supplier #${idOf(m.supplier)} (record not found)`,
        country: s(su?.country),
        city: s(su?.city),
        product: [...new Set(ps.map((p) => s(p.name)))].join('; '),
        gradesListed: [...new Set(ps.flatMap((p) => (p.grades as string[]) ?? []))].join(', '),
        match: s(m.matchedOn),
        contactPerson: s(su?.contactPerson),
        phone: s(su?.phone),
        email: s(su?.email),
        wechat: s(su?.wechat),
        website: s(su?.website),
        documents: docs,
        toConfirm: docs ? `${ASK_ALL} (stated: ${docs}; confirm still valid)` : `${ASK_ALL} (none stated in their documents)`,
        found: true,
      })
    }
  })
  const total = lines.length
  const found = lines.filter((l) => ((l.matches as AnyDoc[]) ?? []).length).length
  return {
    title: s(doc.title),
    customer: s(doc.customer),
    summary: `${found} of ${total} requested materials have at least one supplier in the database (${new Set(rows.filter((r) => r.found).map((r) => r.supplierId)).size} suppliers). ${total - found} have none yet.`,
    rows,
  }
}

const COLS: [keyof TableRow, string, number][] = [
  ['no', 'No.', 5], ['requested', 'Material requested', 32], ['quantity', 'Qty', 9], ['grade', 'Grade / spec requested', 22],
  ['supplier', 'Supplier', 38], ['country', 'Country', 10], ['city', 'City', 16], ['product', 'Product as listed by supplier', 32],
  ['gradesListed', 'Grades listed', 14], ['match', 'Matched on', 22], ['contactPerson', 'Contact person', 24], ['phone', 'Phone', 30],
  ['email', 'Email', 30], ['wechat', 'WeChat / WhatsApp', 18], ['website', 'Website', 24], ['documents', 'Documents stated', 26],
  ['toConfirm', 'Ask the supplier to confirm', 60],
]

export async function orderTableXlsx(t: OrderTable): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const head = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1)
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2744' } }
    r.alignment = { wrapText: true, vertical: 'top' }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
  }
  const wrap = (ws: ExcelJS.Worksheet) => ws.eachRow((row, n) => n > 1 && (row.alignment = { wrapText: true, vertical: 'top' }))

  const a = wb.addWorksheet('Matches')
  a.columns = COLS.map(([key, header, width]) => ({ key, header, width }))
  for (const r of t.rows) {
    const row = a.addRow(r)
    if (!r.found) row.getCell('supplier').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB9C' } }
    else if (r.match.includes('check')) row.getCell('match').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDEBF7' } }
  }
  head(a)
  wrap(a)

  // One row per supplier: who to call and for which materials.
  const b = wb.addWorksheet('By supplier')
  b.columns = [
    { header: 'Supplier', key: 'supplier', width: 38 }, { header: 'Country', key: 'country', width: 10 }, { header: 'City', key: 'city', width: 16 },
    { header: 'Contact person', key: 'contactPerson', width: 24 }, { header: 'Phone', key: 'phone', width: 30 }, { header: 'Email', key: 'email', width: 30 },
    { header: 'WeChat / WhatsApp', key: 'wechat', width: 18 }, { header: 'Materials to ask for', key: 'materials', width: 60 },
    { header: 'Items', key: 'count', width: 7 }, { header: 'Ask them to confirm', key: 'ask', width: 50 },
  ]
  const by = new Map<string, TableRow[]>()
  for (const r of t.rows.filter((x) => x.found)) by.set(r.supplierId, [...(by.get(r.supplierId) ?? []), r])
  for (const [, rs] of [...by].sort((x, y) => y[1].length - x[1].length)) {
    const name = rs[0].supplier
    const mats = [...new Set(rs.map((r) => `${r.requested}${r.quantity ? ` (${r.quantity})` : ''}`))]
    b.addRow({ supplier: name, country: rs[0].country, city: rs[0].city, contactPerson: rs[0].contactPerson, phone: rs[0].phone, email: rs[0].email,
      wechat: rs[0].wechat, materials: mats.join('; '), count: mats.length, ask: ASK_ALL })
  }
  head(b)
  wrap(b)

  const c = wb.addWorksheet('No supplier yet')
  c.columns = [{ header: 'No.', key: 'no', width: 6 }, { header: 'Material requested', key: 'requested', width: 40 }, { header: 'Qty', key: 'quantity', width: 10 },
    { header: 'Grade / spec requested', key: 'grade', width: 30 }]
  for (const r of t.rows.filter((x) => !x.found)) c.addRow(r)
  head(c)
  return Buffer.from(await wb.xlsx.writeBuffer())
}
