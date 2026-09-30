// Reads an uploaded customer order into rows + full text for order-match.ts.
// Excel (.xlsx), CSV, Word (.docx), PDF with a text layer, and plain text. Scanned PDFs and photos
// have no text to read: the result says so instead of guessing.
import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import { extractText, getDocumentProxy } from 'unpdf'

import type { OrderRow } from './order-match.ts'

export type ParsedOrder = { rows: OrderRow[]; text: string; note: string }

const HEAD = {
  name: /^(product|product name|material|material name|item|item name|description|name|api|substance|molecule|commodity|goods)\b/i,
  cas: /\bcas\b/i,
  grade: /\b(grade|spec|specification|standard|pharmacopoeia|pharmacopeia)\b/i,
  quantity: /\b(qty|quantity|amount|volume|kg|mt|tons?)\b/i,
}

function cellText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown }
    if (o.richText) return o.richText.map((r) => r.text).join('')
    if (o.text) return String(o.text)
    if (o.result != null) return String(o.result)
  }
  return String(v).trim()
}

// Table (rows of cells) -> order rows. The header is the row with a product-name column plus the
// most other header words (CAS, grade, quantity); "Name:" / "Date:" form labels are not headers.
function headerScore(r: string[]): number {
  const cells = r.map((c) => c.trim()).filter((c) => c && !c.endsWith(':'))
  if (!cells.some((c) => HEAD.name.test(c))) return 0
  return 1 + [HEAD.cas, HEAD.grade, HEAD.quantity].filter((re) => cells.some((c) => re.test(c))).length
}

function noHeaderRows(table: string[][]): OrderRow[] {
  return table
    .map((r, k) => ({ text: r.filter(Boolean).join(' ').trim(), row: k + 1 }))
    .filter((r) => /[a-z]{3,}/i.test(r.text) && r.text.length <= 200)
}

export function tableToRows(table: string[][]): OrderRow[] {
  let headerAt = -1
  let best = 0
  table.forEach((r, i) => {
    const sc = headerScore(r)
    if (sc > best) [best, headerAt] = [sc, i]
  })
  if (headerAt < 0) return noHeaderRows(table)
  const h = table[headerAt].map((c) => c.trim())
  const col = (re: RegExp) => h.findIndex((c) => !c.endsWith(':') && re.test(c))
  const iName = col(HEAD.name)
  const iCas = col(HEAD.cas)
  const iGrade = col(HEAD.grade)
  const iQty = h.findIndex((c, i) => i !== iName && HEAD.quantity.test(c))
  const rows = table
    .slice(headerAt + 1)
    .map((r, k) => ({
      text: (r[iName] || '').trim(),
      cas: iCas >= 0 ? r[iCas]?.trim() : undefined,
      grade: iGrade >= 0 ? r[iGrade]?.trim() : undefined,
      quantity: iQty >= 0 ? r[iQty]?.trim() : undefined,
      row: headerAt + k + 2,
    }))
    .filter((r) => /[a-z]{3,}/i.test(r.text) || /\d{2,7}-\d{2}-\d/.test(r.cas || ''))
  return rows.length ? rows : noHeaderRows(table)
}

function textToRows(text: string): OrderRow[] {
  return text
    .split(/\r?\n/)
    .map((l, k) => ({ text: l.replace(/\s+/g, ' ').trim(), row: k + 1, fromText: true }))
    .filter((r) => /[a-z]{3,}/i.test(r.text) && r.text.length <= 200)
}

function csvToTable(text: string): string[][] {
  const sep = (text.match(/;/g)?.length ?? 0) > (text.match(/,/g)?.length ?? 0) ? ';' : text.includes('\t') ? '\t' : ','
  return text.split(/\r?\n/).map((line) => {
    const out: string[] = []
    let cur = ''
    let q = false
    for (const ch of line) {
      if (ch === '"') q = !q
      else if (ch === sep && !q) {
        out.push(cur)
        cur = ''
      } else cur += ch
    }
    out.push(cur)
    return out.map((c) => c.trim())
  })
}

export async function parseOrder(buf: Buffer, filename: string, mimetype = ''): Promise<ParsedOrder> {
  const ext = filename.toLowerCase().split('.').pop() || ''
  if (ext === 'xlsx' || mimetype.includes('spreadsheetml')) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as ArrayBuffer)
    const rows: OrderRow[] = []
    const texts: string[] = []
    wb.eachSheet((ws) => {
      const table: string[][] = []
      ws.eachRow({ includeEmpty: false }, (r) => {
        const vals = (r.values as unknown[]).slice(1).map(cellText)
        table.push(vals)
        texts.push(vals.join(' '))
      })
      rows.push(...tableToRows(table))
    })
    return { rows, text: texts.join('\n'), note: `Excel: ${rows.length} rows read` }
  }
  if (ext === 'csv' || mimetype === 'text/csv') {
    const text = buf.toString('utf8')
    const rows = tableToRows(csvToTable(text))
    return { rows, text, note: `CSV: ${rows.length} rows read` }
  }
  if (ext === 'docx' || mimetype.includes('wordprocessingml')) {
    const { value } = await mammoth.extractRawText({ buffer: buf })
    return { rows: textToRows(value), text: value, note: 'Word document: text read line by line' }
  }
  if (ext === 'pdf' || mimetype === 'application/pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buf))
    const { text } = await extractText(pdf, { mergePages: true })
    const t = String(text)
    if (t.replace(/\s/g, '').length < 20) {
      return { rows: [], text: '', note: 'This PDF has no text layer (a scan or photo). Type the materials into "Materials (typed)" instead.' }
    }
    return { rows: textToRows(t), text: t, note: `PDF: ${pdf.numPages} page(s) read` }
  }
  if (ext === 'txt' || mimetype.startsWith('text/')) {
    const t = buf.toString('utf8')
    return { rows: textToRows(t), text: t, note: 'Text file read line by line' }
  }
  return { rows: [], text: '', note: `Files of type .${ext} cannot be read. Use Excel, CSV, Word, PDF or type the materials.` }
}

export function typedToOrder(text: string): ParsedOrder {
  return { rows: textToRows(text), text, note: 'Typed list: one material per line' }
}
