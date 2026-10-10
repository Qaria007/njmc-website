// Draws the distributor's certificate of analysis (with the supplier's original attached at the end)
// and the specification sheet, as A4 PDFs with pdf-lib. English only, like the other trade documents.
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from 'pdf-lib'
import sharp from 'sharp'

import { type CoaDoc, coaStatement, type Issuer, legalWithBrand, type OriginalState, productTypeLabel } from './coa-docs.ts'
import { latin, wrap } from './trade-pdf.ts'

const W = 595.28
const H = 841.89
const M = 40
const INK = rgb(0.1, 0.15, 0.27)
const GREY = rgb(0.42, 0.45, 0.5)
const LINE = rgb(0.8, 0.82, 0.86)
const FILL = rgb(0.94, 0.95, 0.97)

export type Original = { data: Uint8Array; kind: 'pdf' | 'image' }

type Col = { header: string; width: number }

async function drawDocument(
  issuer: Issuer,
  title: string,
  subtitle: string,
  info: [string, string][],
  boxes: { heading: string; lines: [string, string][] }[],
  cols: Col[],
  rows: string[][],
  after: { heading: string; text: string }[],
  signature: { label: string; date: string } | null,
  docName: string,
): Promise<PDFDocument> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(latin(`${title} ${docName}`))
  pdf.setAuthor(latin(issuer.companyName))
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage = pdf.addPage([W, H])
  let y = H - M

  const text = (s: string, x: number, yy: number, size = 9, f: PDFFont = font, color = INK) => page.drawText(latin(s), { x, y: yy, size, font: f, color })
  const rule = (yy: number, x1 = M, x2 = W - M) => page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness: 0.6, color: LINE })

  // Letterhead.
  if (issuer.logo) {
    try {
      const img = issuer.logo.type === 'png' ? await pdf.embedPng(issuer.logo.data) : await pdf.embedJpg(issuer.logo.data)
      const s = Math.min(150 / img.width, 44 / img.height)
      page.drawImage(img, { x: W - M - img.width * s, y: y - img.height * s + 4, width: img.width * s, height: img.height * s })
    } catch {
      // no logo
    }
  }
  // A brand prints large, with the legal company under it.
  const brand = (issuer.brandName ?? '').trim()
  text(brand || issuer.companyName, M, y - 12, 15, bold)
  y -= 26
  if (brand) {
    text(issuer.companyName, M, y, 9.5, bold)
    y -= 12
  }
  const contact = [issuer.phone ? `Tel ${issuer.phone}` : '', issuer.email ?? '', issuer.website ?? ''].filter(Boolean).join('  |  ')
  for (const l of [...wrap(issuer.address ?? '', font, 8.5, W - 2 * M - (issuer.logo ? 160 : 0)), contact].filter(Boolean)) {
    text(l, M, y, 8.5, font, GREY)
    y -= 11
  }
  if (issuer.logo) y = Math.min(y, H - M - 44)
  y -= 4
  rule(y)
  y -= 26
  text(title, (W - bold.widthOfTextAtSize(latin(title), 15)) / 2, y, 15, bold)
  y -= 14
  if (subtitle) {
    for (const l of wrap(subtitle, font, 8.5, W - 2 * M)) {
      text(l, (W - font.widthOfTextAtSize(l, 8.5)) / 2, y, 8.5, font, GREY)
      y -= 11
    }
  }
  y -= 10

  const newPage = () => {
    page = pdf.addPage([W, H])
    y = H - M
  }
  const need = (h: number) => {
    if (y - h < M + 24) newPage()
  }

  // Details in two columns of label / value.
  const half = (W - 2 * M) / 2
  const pairs = info.filter(([, v]) => v)
  for (let i = 0; i < pairs.length; i += 2) {
    const cells = pairs.slice(i, i + 2).map(([k, v]) => ({ k, lines: wrap(v, font, 9, half - 110) }))
    const h = Math.max(...cells.map((c) => c.lines.length)) * 11.5 + 3
    need(h)
    cells.forEach((c, j) => {
      const x = M + j * half
      text(c.k, x, y, 8, font, GREY)
      c.lines.forEach((l, k) => text(l, x + 100, y - k * 11.5, 9, j === 0 && i === 0 ? bold : font))
    })
    y -= h
  }
  y -= 6

  // Framed boxes (manufacturer, laboratory).
  for (const b of boxes) {
    const lines = b.lines.filter(([, v]) => v).flatMap(([k, v]) => wrap(v, font, 9, W - 2 * M - 130).map((l, i) => [i ? '' : k, l] as const))
    const h = 22 + lines.length * 11.5
    need(h + 8)
    page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, borderColor: LINE, borderWidth: 0.8, color: FILL })
    text(b.heading.toUpperCase(), M + 8, y - 13, 7.5, bold, GREY)
    let yy = y - 26
    for (const [k, l] of lines) {
      if (k) text(k, M + 8, yy, 8, font, GREY)
      text(l, M + 120, yy, 9)
      yy -= 11.5
    }
    y -= h + 10
  }

  // The table.
  const scale = (W - 2 * M) / cols.reduce((s, c) => s + c.width, 0)
  const cw = cols.map((c) => c.width * scale)
  const head = () => {
    page.drawRectangle({ x: M, y: y - 20, width: W - 2 * M, height: 20, color: INK })
    let x = M
    cols.forEach((c, i) => {
      text(c.header, x + 4, y - 13, 7.5, bold, rgb(1, 1, 1))
      x += cw[i]
    })
    y -= 20
  }
  need(60)
  head()
  rows.forEach((row, n) => {
    const cells = row.map((c, i) => wrap(c, font, 8.5, cw[i] - 8))
    const h = Math.max(...cells.map((c) => c.length)) * 10.5 + 8
    if (y - h < M + 24) {
      newPage()
      head()
    }
    if (n % 2) page.drawRectangle({ x: M, y: y - h, width: W - 2 * M, height: h, color: FILL })
    let x = M
    cells.forEach((lines, i) => {
      lines.forEach((l, k) => text(l, x + 4, y - 12 - k * 10.5, 8.5))
      x += cw[i]
    })
    y -= h
    rule(y)
  })
  y -= 14

  for (const s of after.filter((a) => a.text)) {
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

  if (signature) {
    need(90)
    y -= 10
    text(signature.label, W - M - 220, y, 9.5, bold)
    text(`Date: ${signature.date}`, M, y, 9)
    y -= 46
    rule(y, W - M - 220, W - M)
    const who = [issuer.signatoryName, issuer.signatoryTitle].filter(Boolean).join(', ')
    text(who || 'Name and title', W - M - 220, y - 11, 8.5, font, GREY)
    text('Signature and company stamp', W - M - 220, y - 22, 8.5, font, GREY)
  }

  return pdf
}

// Page numbers on our own pages, counting the attached original in the total.
async function footers(pdf: PDFDocument, own: number, footLeft: string) {
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const total = pdf.getPageCount()
  pdf.getPages().slice(0, own).forEach((p, i) => {
    const foot = latin(`${footLeft}   |   Page ${i + 1} of ${total}`)
    p.drawText(foot, { x: W - M - font.widthOfTextAtSize(foot, 7.5), y: 24, size: 7.5, font, color: GREY })
  })
}

const v = (x: unknown) => (x == null ? '' : String(x).trim())

// Whether the uploaded original can be attached. A protected PDF would copy as unreadable pages, so it
// is refused; so is a picture this server cannot open (HEIC from an iPhone, for example).
export async function checkOriginal(original: Original | null): Promise<OriginalState> {
  if (!original) return { ok: false, problem: "the supplier's original certificate is not uploaded (it is attached to every copy)" }
  if (original.kind === 'pdf') {
    try {
      const src = await PDFDocument.load(original.data, { ignoreEncryption: true })
      if (src.isEncrypted) return { ok: false, problem: "the supplier's PDF is password-protected and cannot be attached: upload a scan or photo of it, or ask the supplier for an unprotected copy" }
      if (!src.getPageCount()) return { ok: false, problem: "the supplier's PDF has no pages" }
      if (src.getPageCount() > 30) return { ok: false, problem: "the supplier's PDF has more than 30 pages: upload only the certificate" }
    } catch {
      return { ok: false, problem: "the supplier's PDF is damaged and cannot be opened: upload it again, or a scan or photo" }
    }
    return { ok: true }
  }
  try {
    // Decode the whole picture: reading the header alone lets an HEIC through that fails later.
    await sharp(Buffer.from(original.data)).rotate().resize(64).jpeg().toBuffer()
    return { ok: true }
  } catch {
    return { ok: false, problem: "the supplier's picture cannot be opened (HEIC?): upload it as JPG, PNG or PDF" }
  }
}

// The original after our pages. A PDF is copied page by page unchanged (stamps, signatures and other
// annotations kept, nothing drawn over it), after a cover page naming it as the attachment. A photo
// goes on its own A4 page under the same note.
async function attach(doc: PDFDocument, original: Original, note: string): Promise<number> {
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const label = (p: PDFPage, y: number) => {
    for (const [i, l] of wrap(note, font, 9, W - 2 * M).entries()) p.drawText(l, { x: M, y: y - i * 12, size: 9, font, color: INK })
  }
  if (original.kind === 'pdf') {
    const src = await PDFDocument.load(original.data)
    const cover = doc.addPage([W, H])
    label(cover, H / 2 + 20)
    for (const p of await doc.copyPages(src, src.getPageIndices())) doc.addPage(p)
    return src.getPageCount()
  }
  const TOP = 40
  const jpg = await sharp(Buffer.from(original.data)).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer()
  const img = await doc.embedJpg(jpg)
  const boxW = W - 2 * M
  const boxH = H - TOP - M
  const k = Math.min(boxW / img.width, boxH / img.height)
  const p = doc.addPage([W, H])
  label(p, H - 24)
  p.drawImage(img, { x: M + (boxW - img.width * k) / 2, y: M + boxH - img.height * k, width: img.width * k, height: img.height * k })
  return 1
}

// The distributor's certificate, with the original appended after its own pages.
export async function renderCoaPdf(d: CoaDoc, issuer: Issuer, original: Original, draft = false): Promise<Uint8Array> {
  const state = await checkOriginal(original)
  if (!state.ok) throw new Error(state.problem)
  const attached = original.kind === 'pdf' ? (await PDFDocument.load(original.data)).getPageCount() : 1

  const lab = d.resultsSource === 'lab'
  const doc = await drawDocument(
    issuer,
    'CERTIFICATE OF ANALYSIS',
    lab
      ? `Issued by ${legalWithBrand(issuer)} as distributor, with the results of an independent laboratory. The manufacturer's certificate is attached.`
      : `Issued by ${legalWithBrand(issuer)} as distributor, on the basis of the manufacturer's certificate, which is attached.`,
    [
      ['Product', v(d.productName)], ['Certificate No.', v(d.number)],
      ['Kind of product', d.productType ? productTypeLabel(d.productType) : ''], ['Date of issue', v(d.issueDate)],
      ['Grade', v(d.grade)], ['', ''],
      ['Specification', v(d.specification)], ['Customer', v(d.customerName)],
      ['CAS No.', v(d.casNo)], ['Customer reference', v(d.customerRef)],
      ['Batch No.', v(d.batchNo)], ['Quantity supplied', v(d.quantitySupplied)],
      ['Batch size', v(d.batchSize)], ['Packaging', v(d.packaging)],
      ['Manufacturing date', v(d.mfgDate)], [d.expiryKind === 'retest' ? 'Retest date' : 'Expiry date', v(d.expiryDate)],
      ['Storage', v(d.storage)], ['Released under', v(d.licence)],
    ],
    [
      {
        heading: 'Original manufacturer',
        lines: [['Name', v(d.manufacturerName)], ['Site address', v(d.manufacturerAddress)], ['Telephone', v(d.manufacturerPhone)], ["Manufacturer's CoA No.", v(d.originalCoaNo)], ['Dated', v(d.originalCoaDate)]],
      },
      ...(lab
        ? [{ heading: 'Testing laboratory', lines: [['Name', v(d.labName)], ['Address', v(d.labAddress)], ['Telephone', v(d.labPhone)], ['Report No.', v(d.labReportNo)], ['Dated', v(d.labReportDate)]] as [string, string][] }]
        : []),
    ],
    [{ header: 'No.', width: 5 }, { header: 'Test', width: 30 }, { header: 'Acceptance criteria', width: 30 }, { header: 'Result', width: 20 }, { header: 'Method', width: 15 }],
    d.tests.filter((x) => v(x.test)).map((x, i) => [String(i + 1), v(x.test), v(x.criteria), v(x.result), v(x.method)]),
    [
      { heading: 'Conclusion', text: v(d.conclusion) },
      { heading: 'Basis of this certificate', text: coaStatement(d, issuer, attached, original.kind === 'image') },
      { heading: 'Remarks', text: v(d.remarks) },
    ],
    { label: 'Quality approval', date: v(d.issueDate) },
    v(d.number),
  )

  const ownPages = doc.getPageCount()
  await attach(doc, original, `Attachment to certificate ${v(d.number)}: the original certificate of analysis No. ${v(d.originalCoaNo)} from ${v(d.manufacturerName)}${original.kind === 'pdf' ? `, ${attached} page${attached === 1 ? '' : 's'}, follows unchanged.` : ', photographed below.'}`)
  await footers(doc, ownPages, v(d.number))
  // A preview before the certificate is issued: marked on every page of ours so it is never used.
  if (draft) {
    const bold = await doc.embedFont(StandardFonts.HelveticaBold)
    for (const p of doc.getPages().slice(0, ownPages)) {
      p.drawText('DRAFT, NOT ISSUED', { x: 120, y: 260, size: 54, font: bold, color: rgb(0.85, 0.2, 0.2), opacity: 0.18, rotate: degrees(35) })
    }
  }
  doc.setSubject(latin(`${ownPages} pages and the original certificate (${attached} pages)`))
  return doc.save()
}

// The specification sheet: tests and limits only.
export async function renderSpecPdf(d: CoaDoc, issuer: Issuer, date: string): Promise<Uint8Array> {
  const doc = await drawDocument(
    issuer,
    'PRODUCT SPECIFICATION',
    'Specification sheet. Not a certificate of analysis: the results of each batch are given on the certificate supplied with the goods.',
    [
      ['Product', v(d.productName)], ['Date', date],
      ['Grade', v(d.grade)], ['CAS No.', v(d.casNo)],
      ['Specification', v(d.specification)], ['Storage', v(d.storage)],
      ['Packaging', v(d.packaging)], ['', ''],
    ],
    [],
    [{ header: 'No.', width: 6 }, { header: 'Test', width: 36 }, { header: 'Acceptance criteria', width: 38 }, { header: 'Method', width: 20 }],
    d.tests.filter((x) => v(x.test)).map((x, i) => [String(i + 1), v(x.test), v(x.criteria), v(x.method)]),
    [{ heading: 'Remarks', text: v(d.specNotes) }],
    null,
    `Specification ${v(d.productName)}${v(d.grade) ? ` ${v(d.grade)}` : ''}`,
  )
  await footers(doc, doc.getPageCount(), `Specification ${v(d.productName)}${v(d.grade) ? ` ${v(d.grade)}` : ''}`)
  return doc.save()
}
