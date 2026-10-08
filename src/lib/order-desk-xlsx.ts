// Excel files for the order desk: a trade document (the same content as its PDF) and the accounts.
import ExcelJS from 'exceljs'

import type { Overview } from './order-desk.ts'
import type { DocSpec } from './trade-docs.ts'

const NAVY = 'FF1A2744'

function head(ws: ExcelJS.Worksheet, row = 1) {
  const r = ws.getRow(row)
  r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  r.alignment = { wrapText: true, vertical: 'top' }
}

// Numbers printed as "1,234.50" in the PDF go into Excel as numbers, so the client can add them up.
const asNumber = (v: string): string | number => (/^-?[\d,]+(\.\d+)?$/.test(v.trim()) && /\d/.test(v) ? Number(v.replace(/,/g, '')) : v)

export async function docSpecXlsx(spec: DocSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = spec.seller.companyName
  const ws = wb.addWorksheet(spec.title.slice(0, 31))
  ws.columns = spec.columns.map((c) => ({ width: Math.max(8, Math.round(c.width / 5)) }))
  const add = (vals: (string | number)[], bold = false) => {
    const r = ws.addRow(vals)
    if (bold) r.font = { bold: true }
    r.alignment = { wrapText: true, vertical: 'top' }
    return r
  }
  add([spec.seller.companyName], true).font = { bold: true, size: 14 }
  for (const l of [spec.seller.address, [spec.seller.phone, spec.seller.email, spec.seller.website].filter(Boolean).join('  |  ')].filter(Boolean)) add([String(l)])
  add([])
  add([spec.title], true).font = { bold: true, size: 13 }
  add([])
  add([spec.left.heading], true)
  for (const l of spec.left.lines) add([l])
  add([])
  for (const [k, v] of spec.right) add([k, v])
  add([])
  const h = add(spec.columns.map((c) => c.header))
  head(ws, h.number)
  for (const row of spec.rows) {
    const r = add(row.map(asNumber))
    spec.columns.forEach((c, i) => {
      if (c.align === 'right') r.getCell(i + 1).alignment = { horizontal: 'right', vertical: 'top', wrapText: true }
      if (typeof r.getCell(i + 1).value === 'number' && /price|amount/i.test(c.header)) r.getCell(i + 1).numFmt = '#,##0.00'
    })
  }
  add([])
  const n = spec.columns.length
  for (const [k, v] of spec.totals) {
    if (!k) add([v])
    else {
      const r = add([...Array(Math.max(0, n - 2)).fill(''), k, asNumber(v)], k.startsWith('Total'))
      if (typeof r.getCell(n).value === 'number') r.getCell(n).numFmt = '#,##0.00'
    }
  }
  for (const sct of spec.sections) {
    add([])
    add([sct.heading], true)
    for (const l of sct.text.split('\n')) add([l])
  }
  if (spec.signature) {
    add([])
    add([spec.signature], true)
    add([[spec.seller.signatoryName, spec.seller.signatoryTitle].filter(Boolean).join(', ')])
  }
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return Buffer.from(await wb.xlsx.writeBuffer())
}

export async function overviewXlsx(o: Overview): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const money = (ws: ExcelJS.Worksheet, keys: string[]) => keys.forEach((k) => (ws.getColumn(k).numFmt = '#,##0.00'))

  const s = wb.addWorksheet('Summary')
  s.columns = [{ header: 'Item', key: 'k', width: 40 }, { header: 'USD', key: 'v', width: 16 }]
  const T = o.totals
  for (const [k, v] of [
    ['Period', `${o.from || 'start'} to ${o.to || 'today'}`], ['Received from clients', T.received], ['Paid to suppliers', T.paidSuppliers], ['Costs', T.expenses],
    ['Net cash (received less paid and costs)', T.cashNet], ['Profit on sales dated in the period', T.profit],
    ['Clients still owe us (today)', T.receivable], ['We still owe suppliers (today)', T.payable],
    ...(o.missingRates.length ? [['Missing exchange rate (not counted)', o.missingRates.join(', ')]] : []),
  ] as [string, string | number][]) s.addRow({ k, v })
  head(s)
  money(s, ['v'])

  const a = wb.addWorksheet('Sales')
  a.columns = [
    { header: 'PI no.', key: 'number', width: 20 }, { header: 'Invoice no.', key: 'invoiceNumber', width: 20 }, { header: 'Client', key: 'buyer', width: 32 }, { header: 'Date', key: 'date', width: 12 },
    { header: 'Status', key: 'status', width: 12 }, { header: 'Total USD', key: 'totalUsd', width: 14 }, { header: 'Received USD', key: 'receivedUsd', width: 14 },
    { header: 'Still owed USD', key: 'outstandingUsd', width: 14 }, { header: 'Cost USD', key: 'costUsd', width: 14 }, { header: 'Cost from', key: 'costFrom', width: 22 },
    { header: 'Other costs USD', key: 'expensesUsd', width: 14 }, { header: 'Profit USD', key: 'profitUsd', width: 14 },
  ]
  for (const r of o.sales) a.addRow({ ...r, costFrom: r.costUsd == null ? 'no cost recorded' : r.costIsEstimate ? 'cost prices on the PI' : 'purchase orders' })
  head(a)
  money(a, ['totalUsd', 'receivedUsd', 'outstandingUsd', 'costUsd', 'expensesUsd', 'profitUsd'])

  const b = wb.addWorksheet('Purchases')
  b.columns = [
    { header: 'PO no.', key: 'number', width: 20 }, { header: 'Supplier', key: 'supplier', width: 36 }, { header: 'Date', key: 'date', width: 12 }, { header: 'Status', key: 'status', width: 12 },
    { header: 'Total USD', key: 'totalUsd', width: 14 }, { header: 'Paid USD', key: 'paidUsd', width: 14 }, { header: 'Still owed USD', key: 'owedUsd', width: 14 },
  ]
  for (const r of o.purchases) b.addRow(r)
  head(b)
  money(b, ['totalUsd', 'paidUsd', 'owedUsd'])

  const c = wb.addWorksheet('Money in and out')
  c.columns = [
    { header: 'Date', key: 'date', width: 12 }, { header: 'Type', key: 'type', width: 22 }, { header: 'Kind of cost', key: 'category', width: 18 }, { header: 'Client / supplier / paid to', key: 'party', width: 32 },
    { header: 'Amount', key: 'amount', width: 14 }, { header: 'Currency', key: 'currency', width: 9 }, { header: 'USD', key: 'usd', width: 14 }, { header: 'Method', key: 'method', width: 16 },
    { header: 'Reference', key: 'reference', width: 22 }, { header: 'Notes', key: 'notes', width: 40 },
  ]
  const TYPE = { in: 'Received from client', out: 'Paid to supplier', expense: 'Cost' }
  for (const r of o.ledger) c.addRow({ ...r, type: TYPE[r.direction] })
  head(c)
  money(c, ['amount', 'usd'])
  for (const ws of [a, b, c]) ws.views = [{ state: 'frozen', ySplit: 1 }]
  return Buffer.from(await wb.xlsx.writeBuffer())
}
