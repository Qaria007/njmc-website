import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

import {
  changedFromReading, cleanPrefix, cleanReading, coaGaps, coaNumber, type CoaDoc, coaStatement, type OriginalState, sameCompany, specGaps,
} from '../src/lib/coa-docs.ts'
import { checkOriginal, renderCoaPdf, renderSpecPdf } from '../src/lib/coa-pdf.ts'
import { latin } from '../src/lib/trade-pdf.ts'

const issuer = { companyName: 'NJMC Medical Supplies Co., Ltd', address: 'Nanjing, China', email: 'sale@example.com', signatoryName: 'A. Person', signatoryTitle: 'Quality Manager' }
const OK: OriginalState = { ok: true }
const MISSING: OriginalState = { ok: false, problem: "the supplier's original certificate is not uploaded" }

const doc: CoaDoc = {
  number: 'NJMC-COA-2026-0001', issueDate: '2026-10-09', productName: 'Levofloxacin', grade: 'USP', specification: 'USP 2025', casNo: '138199-71-0',
  batchNo: 'LF2026091', batchSize: '500 kg', mfgDate: '2026-09-01', expiryDate: '2028-08-31', expiryKind: 'expiry',
  manufacturerName: 'Example Pharmaceutical Co., Ltd', manufacturerAddress: '1 Example Road, Taizhou, Zhejiang, China', manufacturerPhone: '+86 576 0000 0000',
  originalCoaNo: 'QC-2026-0912', originalCoaDate: '2026-09-12', resultsSource: 'manufacturer', handling: 'unchanged', conclusion: 'The batch complies with USP 2025',
  tests: [
    { test: 'Description', criteria: 'Light yellowish-white to yellow-white crystal or crystalline powder', result: 'Complies', method: 'Visual' },
    { test: 'Assay (anhydrous)', criteria: '98.0% to 102.0%', result: '99.6%', method: 'USP <621>' },
    { test: 'Related substances: any individual impurity', criteria: '<= 0.2%', result: '0.05%', method: 'USP <621>' },
  ],
}

async function onePagePdf(rotate = 0): Promise<Uint8Array> {
  const p = await PDFDocument.create()
  const page = p.addPage([595, 842])
  page.drawText('Original certificate', { x: 50, y: 800 })
  if (rotate) page.setRotation({ type: 'degrees' as never, angle: rotate } as never)
  return p.save()
}

test('numbers and prefixes', () => {
  assert.equal(coaNumber('NJMC', 2026, 7), 'NJMC-COA-2026-0007')
  assert.equal(cleanPrefix(' njmc '), 'NJMC')
  assert.equal(cleanPrefix('a', 'PT'), 'PT')
  assert.equal(cleanPrefix('Way too long prefix', 'PT'), 'PT')
})

test('the certificate cannot be printed without the manufacturer or the original', () => {
  assert.deepEqual(coaGaps(doc, OK, { issuer }), [])
  const g = coaGaps({ ...doc, manufacturerName: '', manufacturerAddress: ' ', manufacturerPhone: '', originalCoaNo: '' }, MISSING)
  assert.ok(g.some((x) => x.includes('not uploaded')))
  assert.ok(g.some((x) => x.includes('name of the original manufacturer')))
  assert.ok(g.some((x) => x.includes("manufacturer's address")))
  assert.ok(g.some((x) => x.includes("manufacturer's telephone")))
  assert.ok(g.some((x) => x.includes("number of the manufacturer's certificate")))
})

test('placeholders, the letterhead company and the trader are not a manufacturer', () => {
  for (const name of ['-', 'N/A', 'see attached', 'Unknown', 'TBD']) {
    assert.ok(coaGaps({ ...doc, manufacturerName: name }, OK, { issuer }).some((x) => x.includes('manufacturer')), name)
  }
  assert.ok(coaGaps({ ...doc, manufacturerName: 'NJMC Medical Supplies Co., Ltd' }, OK, { issuer }).some((x) => x.includes('not the letterhead company')))
  assert.ok(coaGaps({ ...doc, manufacturerName: 'Some Trading Co' }, OK, { issuer, issuedBy: 'some trading co' }).some((x) => x.includes('not the trader')))
  assert.ok(coaGaps({ ...doc, manufacturerName: 'NJMC Medical Supplies' }, OK, { issuer }).some((x) => x.includes('not the letterhead company')))
  assert.ok(sameCompany('Zhejiang Example Pharma Co., Ltd.', 'zhejiang example pharma'))
  assert.ok(!sameCompany('Example Pharmaceutical Co., Ltd', 'NJMC Medical Supplies Co., Ltd'))
})

test('every row needs a result, the laboratory needs its details, handling must be confirmed, text must be English', () => {
  assert.ok(coaGaps({ ...doc, tests: [...doc.tests, { test: 'Water', criteria: '<= 0.5%', result: '' }] }, OK).includes('a result in every test row'))
  const lab = coaGaps({ ...doc, resultsSource: 'lab', labName: 'Lab', labReportNo: 'R1', labAddress: '', labPhone: '' }, OK)
  assert.ok(lab.some((x) => x.includes("laboratory's address and telephone")))
  assert.ok(coaGaps({ ...doc, handling: null }, OK).some((x) => x.includes('repacked')))
  assert.ok(coaGaps({ ...doc, manufacturerName: '浙江某药业有限公司' }, OK).some((x) => x.includes('English text in')))
  assert.ok(coaGaps({ ...doc, originalCoaNo: 'QC-2026-0912号' }, OK).some((x) => x.includes("manufacturer's certificate No.")))
  assert.ok(coaGaps({ ...doc, customerName: 'شركة' }, OK).some((x) => x.includes('customer')))
  assert.ok(coaGaps(doc, OK, { issuer: { ...issuer, address: '南京' } }).some((x) => x.includes('letterhead company')))
  // Signs common on certificates are fine.
  assert.deepEqual(coaGaps({ ...doc, tests: [{ test: 'Water', criteria: '≤ 0.5%', result: '0.1%', method: '' }, { test: 'Storage test', criteria: '2℃～8℃, α-form, 5 μg/g', result: 'Complies', method: '' }] }, OK), [])
})

test('a different file after the AI reading blocks printing', () => {
  const reading = { tests: doc.tests, sourceFile: 6 }
  assert.deepEqual(coaGaps(doc, OK, { reading, sourceFile: 6 }), [])
  assert.ok(coaGaps(doc, OK, { reading, sourceFile: 7 }).some((x) => x.includes('read the new file again')))
  // The same document record with its file replaced.
  assert.ok(coaGaps(doc, OK, { reading: { ...reading, sha256: 'aaa' }, sourceFile: 6, fileSha256: 'bbb' }).some((x) => x.includes('replaced inside its document')))
  assert.deepEqual(coaGaps(doc, OK, { reading: { ...reading, sha256: 'aaa' }, sourceFile: 6, fileSha256: 'aaa' }), [])
})

test('the specification sheet needs only the product and the limits', () => {
  const spec = { ...doc, batchNo: '', manufacturerName: '', manufacturerAddress: '', originalCoaNo: '', tests: doc.tests.map((x) => ({ ...x, result: '' })) }
  assert.deepEqual(specGaps(spec), [])
  assert.ok(specGaps({ ...spec, tests: [{ test: 'Assay', criteria: '' }] }).includes('an acceptance criterion in every test row'))
  assert.deepEqual(specGaps({ ...spec, manufacturerName: '浙江' }), [])
  assert.ok(specGaps({ ...spec, specNotes: '包装' }).some((x) => x.includes('specification remarks')))
})

test('the statement names the manufacturer, the handling and the attached original', () => {
  const st = coaStatement(doc, issuer, 2)
  assert.match(st, /Example Pharmaceutical Co\., Ltd, 1 Example Road.*telephone \+86/)
  assert.match(st, /No\. QC-2026-0912 dated 2026-09-12/)
  assert.match(st, /did not perform these tests/)
  assert.match(st, /original packaging and has not changed the material/)
  assert.match(st, /unchanged as the last 2 pages, after a cover page/)
  assert.match(coaStatement(doc, issuer, 1, true), /photographed, as the last page/)
  assert.match(coaStatement({ ...doc, handling: 'repacked' }, issuer, 1), /has repacked or relabelled it/)
  const lab = coaStatement({ ...doc, resultsSource: 'lab', labName: 'Test Lab', labAddress: 'Lab Road 1', labPhone: '+86 25 0000 0000', labReportNo: 'R-1' }, issuer, 1)
  assert.match(lab, /report No\. R-1 of Test Lab, Lab Road 1, telephone/)
  assert.match(lab, /manufactured by Example Pharmaceutical/)
  assert.match(lab, /as the last page, after a cover page/)
})

test('changes since the AI reading are listed, by row and for the identity fields', () => {
  const reading = { tests: doc.tests, fields: { manufacturerName: doc.manufacturerName ?? '', batchNo: doc.batchNo ?? '' } }
  assert.deepEqual(changedFromReading(reading, doc), [])
  assert.deepEqual(changedFromReading(null, doc), [])
  const now = { ...doc, manufacturerName: 'Other Co', tests: [{ ...doc.tests[0] }, { ...doc.tests[1], result: '100.4%' }] }
  const c = changedFromReading(reading, now)
  assert.ok(c.some((x) => x.includes('manufacturer name: read as "Example Pharmaceutical Co., Ltd", now "Other Co"')))
  assert.ok(c.some((x) => x.includes('read as "99.6%", now "100.4%"')))
  assert.ok(c.some((x) => x.includes('row 3') && x.includes('was removed')))
  // Two rows with the same name compare by position.
  const twin = { tests: [{ test: 'Identification', result: 'Positive' }, { test: 'Identification', result: 'Conforms' }] }
  assert.ok(changedFromReading(twin, { ...doc, tests: [{ test: 'Identification', result: 'Positive' }, { test: 'Identification', result: 'Positive' }] }).some((x) => x.startsWith('row 2')))
})

test('a reading is cleaned', () => {
  const r = cleanReading({ productName: ' Levofloxacin ', expiryKind: 'later', tests: [{ test: '', criteria: 'x', result: 'y', method: '' }, { test: 'Assay', criteria: '98-102%', result: '99%', method: '' }] } as never)
  assert.equal(r.productName, 'Levofloxacin')
  assert.equal(r.expiryKind, '')
  assert.equal(r.tests.length, 1)
  assert.equal(cleanReading(null).tests.length, 0)
})

test('symbols on certificates survive into the PDF text', () => {
  assert.equal(latin('≤ 0.5% and ≥ 98.0%'), '<= 0.5% and >= 98.0%')
  assert.equal(latin('2℃～8℃ α μg'), '2°C~8°C alpha µg')
})

test('a protected, damaged or missing original is refused', async () => {
  assert.equal((await checkOriginal(null)).ok, false)
  assert.equal((await checkOriginal({ data: new Uint8Array([1, 2, 3]), kind: 'pdf' })).ok, false)
  assert.equal((await checkOriginal({ data: new Uint8Array([1, 2, 3]), kind: 'image' })).ok, false)
  // A JPEG whose header is fine but whose picture data is cut off.
  const jpg = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#ff0000' } }).jpeg().toBuffer()
  assert.equal((await checkOriginal({ data: new Uint8Array(jpg.subarray(0, 300)), kind: 'image' })).ok, false)
  // A PDF with an /Encrypt entry in its trailer, as a password-protected supplier PDF has.
  const p = await PDFDocument.create()
  p.addPage()
  p.context.trailerInfo.Encrypt = p.context.obj({ Filter: 'Standard', V: 4, R: 4 })
  const enc = await checkOriginal({ data: await p.save(), kind: 'pdf' })
  assert.equal(enc.ok, false)
  assert.match(enc.ok ? '' : enc.problem, /password-protected/)
  await assert.rejects(renderCoaPdf(doc, issuer, { data: await p.save(), kind: 'pdf' }))
})

test('the certificate PDF has our pages followed by the original, each on its own page', async () => {
  const bytes = await renderCoaPdf(doc, issuer, { data: await onePagePdf(90), kind: 'pdf' })
  const pdf = await PDFDocument.load(bytes)
  // Our page, the cover page, the original page (copied with its turn).
  assert.equal(pdf.getPageCount(), 3)
  assert.equal(pdf.getPage(2).getRotation().angle, 90)
  assert.match(pdf.getSubject() ?? '', /original certificate \(1 pages\)/)
  // A photo of the original becomes one page, kept small.
  const png = await sharp({ create: { width: 3000, height: 4000, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const many = { ...doc, tests: Array.from({ length: 80 }, (_, i) => ({ test: `Impurity ${i + 1}`, criteria: '<= 0.10%', result: '0.02%', method: 'HPLC' })) }
  const big = await renderCoaPdf(many, issuer, { data: new Uint8Array(png), kind: 'image' }, true)
  assert.ok((await PDFDocument.load(big)).getPageCount() >= 3)
  assert.ok(big.length < 2_000_000)
})

test('the specification sheet PDF', async () => {
  const bytes = await renderSpecPdf({ ...doc, specNotes: 'Packed in 25 kg drums' }, issuer, '2026-10-09')
  assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1)
})

test('only a company with a valid licence covering the product may release the certificate', async () => {
  const { pickLicence, licenceLine } = await import('../src/lib/coa-docs.ts')
  const lic = [
    { kind: 'business', number: 'B-1', covers: ['chemical'], printOnCertificate: true },
    { kind: 'drug-distribution', number: 'DD-7', authority: 'Jiangsu MPA', validFrom: '2025-01-01', validUntil: '2027-12-31', covers: ['api', 'excipient'], printOnCertificate: true },
  ]
  const ok = pickLicence(lic, 'api', '2026-10-10')
  assert.ok('licence' in ok && ok.licence.number === 'DD-7')
  assert.equal(licenceLine('licence' in ok ? ok.licence : {}), 'Drug distribution / wholesale licence, No. DD-7, Jiangsu MPA, valid until 2027-12-31')
  assert.match(String((pickLicence(lic, 'finished', '2026-10-10') as { problem?: string }).problem), /licence covering finished medicines/)
  assert.match(String((pickLicence(lic, 'api', '2028-01-01') as { problem?: string }).problem), /expired or not yet valid/)
  assert.match(String((pickLicence(lic, null, '2026-10-10') as { problem?: string }).problem), /kind of product/)
  assert.match(String((pickLicence([], 'api', '2026-10-10') as { problem?: string }).problem), /Our companies/)
  // A business licence ticked as covering APIs does not release an API.
  assert.match(String((pickLicence([{ kind: 'business', number: 'B-2', covers: ['api'] }], 'api', '2026-10-10') as { problem?: string }).problem), /licence covering active/)
  assert.ok('licence' in pickLicence(lic, 'chemical', '2026-10-10'))
  // The licence problem blocks the certificate.
  assert.ok(coaGaps(doc, OK, { licenceProblem: 'a valid licence' }).includes('a valid licence'))
})

test('a date picked in the admin keeps its day', async () => {
  const { pickedDay } = await import('../src/lib/coa-docs.ts')
  // What the admin date picker stores for 31 December.
  assert.equal(pickedDay('2027-12-31T12:00:00.000Z'), '2027-12-31')
  assert.equal(pickedDay('2027-12-30T16:00:00.000Z'), '2027-12-31')
  assert.equal(pickedDay('2027-12-31T05:00:00.000Z'), '2027-12-31')
  assert.equal(pickedDay('2027-12-31'), '2027-12-31')
})
