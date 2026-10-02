// Draws a trade document (DocSpec from trade-docs.ts) as an A4 PDF with pdf-lib and its built-in
// Helvetica. The built-in fonts hold Latin text only, so other scripts (Chinese, Arabic) are left
// out of the PDF: documents are written in English.
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib'

import type { DocSpec } from './trade-docs.ts'

const W = 595.28
const H = 841.89
const M = 40
const INK = rgb(0.1, 0.15, 0.27)
const GREY = rgb(0.42, 0.45, 0.5)
const LINE = rgb(0.8, 0.82, 0.86)
const FILL = rgb(0.94, 0.95, 0.97)

// Typographic quotes, dashes, ellipsis, no-break space and full-width brackets, by code point.
const MAP: Record<number, string> = { 0x2018: "'", 0x2019: "'", 0x201c: '"', 0x201d: '"', 0x2013: '-', 0x2014: '-', 0x2026: '...', 0xa0: ' ', 0xff08: '(', 0xff09: ')', 0xff0c: ',', 0xff1a: ':' }

// Text the built-in fonts can draw: printable ASCII and Latin-1. Anything else is dropped.
export function latin(text: string): string {
  return [...text]
    .map((c) => MAP[c.codePointAt(0) ?? 0] ?? c)
    .join('')
    .replace(/[^\n\x20-\x7E\xA1-\xFF]/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+/g, ' ')
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = []
  for (const para of latin(text).split('\n')) {
    let line = ''
    for (let word of para.trim().split(' ')) {
      // A single word wider than the column is cut.
      while (font.widthOfTextAtSize(word, size) > width && word.length > 1) {
        let n = word.length - 1
        while (n > 1 && font.widthOfTextAtSize(word.slice(0, n), size) > width) n--
        if (line) out.push(line)
        out.push(word.slice(0, n))
        line = ''
        word = word.slice(n)
      }
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line)
        line = word
      } else line = next
    }
    out.push(line)
  }
  return out.length ? out : ['']
}

export async function renderPdf(spec: DocSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(latin(spec.fileName.replace(/\.pdf$/, '')))
  pdf.setAuthor(latin(spec.seller.companyName))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M

  const text = (s: string, x: number, yy: number, size = 9, f = font, color = INK) => page.drawText(latin(s), { x, y: yy, size, font: f, color })
  const right = (s: string, x: number, yy: number, size = 9, f = font) => text(s, x - f.widthOfTextAtSize(latin(s), size), yy, size, f)
  const rule = (yy: number, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: LINE })

  const scale = (W - 2 * M) / spec.columns.reduce((s, c) => s + c.width, 0)
  const cols = spec.columns.map((c) => ({ ...c, width: c.width * scale }))
  const tableHead = () => {
    page.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: INK })
    let x = M
    for (const c of cols) {
      const lines = wrap(c.header, bold, 7.5, c.width - 8)
      lines.slice(0, 2).forEach((l, i) => {
        const yy = y - (lines.length > 1 ? 8 : 12.5) - i * 8.5
        if (c.align === 'right') page.drawText(l, { x: x + c.width - 4 - bold.widthOfTextAtSize(l, 7.5), y: yy, size: 7.5, font: bold, color: rgb(1, 1, 1) })
        else page.drawText(l, { x: x + 4, y: yy, size: 7.5, font: bold, color: rgb(1, 1, 1) })
      })
      x += c.width
    }
    y -= 20
  }
  const newPage = (withHead: boolean) => {
    page = pdf.addPage([W, H])
    y = H - M
    if (withHead) tableHead()
  }
  const need = (h: number, withHead = false) => {
    if (y - h < M + 24) newPage(withHead)
  }

  // Seller header.
  text(spec.seller.companyName, M, y - 12, 15, bold)
  y -= 26
  const contact = [spec.seller.phone ? `Tel ${spec.seller.phone}` : '', spec.seller.email ?? '', spec.seller.website ?? ''].filter(Boolean).join('  |  ')
  for (const l of [...wrap(spec.seller.address ?? '', font, 8.5, W - 2 * M), contact].filter(Boolean)) {
    text(l, M, y, 8.5, font, GREY)
    y -= 11
  }
  y -= 4
  rule(y)
  y -= 26
  const tw = bold.widthOfTextAtSize(spec.title, 15)
  text(spec.title, (W - tw) / 2, y, 15, bold)
  y -= 24

  // Two blocks: who it is for (left) and the document's own details (right).
  const top = y
  const half = (W - 2 * M) / 2
  text(spec.left.heading.toUpperCase(), M, y, 7.5, bold, GREY)
  y -= 13
  spec.left.lines.forEach((l, i) => {
    for (const w of wrap(l, i ? font : bold, 9.5, half - 20)) {
      text(w, M, y, 9.5, i ? font : bold)
      y -= 12
    }
  })
  let ry = top
  for (const [k, v] of spec.right) {
    const lines = wrap(v, font, 9.5, half - 95)
    text(k, M + half + 10, ry, 8.5, font, GREY)
    lines.forEach((l, i) => text(l, M + half + 100, ry - i * 12, 9.5, i === 0 && k === spec.right[0][0] ? bold : font))
    ry -= 12 * lines.length + 2
  }
  y = Math.min(y, ry) - 12

  // Items.
  tableHead()
  spec.rows.forEach((row, n) => {
    const cells = row.map((c, i) => wrap(c, font, 8.5, cols[i].width - 8))
    const h = Math.max(...cells.map((c) => c.length)) * 10.5 + 8
    need(h, true)
    if (n % 2) page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: FILL })
    let x = M
    cells.forEach((lines, i) => {
      lines.forEach((l, k) => {
        const yy = y - 12 - k * 10.5
        if (cols[i].align === 'right') right(l, x + cols[i].width - 4, yy, 8.5)
        else text(l, x + 4, yy, 8.5)
      })
      x += cols[i].width
    })
    y -= h
    rule(y)
  })
  y -= 6

  // Totals, right-aligned; a row with no label is a full-width line (amount in words).
  for (const [k, v] of spec.totals) {
    if (!k) {
      for (const l of wrap(v, font, 8.5, W - 2 * M)) {
        need(12)
        text(l, M, y - 9, 8.5, font, GREY)
        y -= 12
      }
      continue
    }
    need(16)
    const last = k.startsWith('Total')
    right(k, W - M - 110, y - 11, 9.5, last ? bold : font)
    right(v, W - M - 4, y - 11, 9.5, last ? bold : font)
    y -= 16
  }
  y -= 8

  for (const s of spec.sections) {
    const lines = wrap(s.text, font, 9, W - 2 * M)
    need(14 + Math.min(lines.length, 3) * 11.5 + 6)
    text(s.heading.toUpperCase(), M, y - 8, 7.5, bold, GREY)
    y -= 20
    for (const l of lines) {
      need(12)
      text(l, M, y, 9)
      y -= 11.5
    }
    y -= 8
  }

  if (spec.signature) {
    need(80)
    y -= 14
    text(spec.signature, W - M - 220, y, 9.5, bold)
    y -= 46
    rule(y, W - M - 220, W - M)
    const who = [spec.seller.signatoryName, spec.seller.signatoryTitle].filter(Boolean).join(', ')
    text(who || 'Authorised signature and company stamp', W - M - 220, y - 11, 8.5, font, GREY)
  }

  const pages = pdf.getPages()
  pages.forEach((p, i) => {
    const foot = latin(`${spec.fileName.replace(/\.pdf$/, '')}   |   Page ${i + 1} of ${pages.length}`)
    p.drawText(foot, { x: W - M - font.widthOfTextAtSize(foot, 7.5), y: 24, size: 7.5, font, color: GREY })
  })
  return pdf.save()
}
