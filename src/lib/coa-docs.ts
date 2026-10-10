// Certificates on our letterhead: a supplier's certificate of analysis re-issued by NJMC (or a partner
// company) as the distributor, and a specification sheet for quoting. Pure functions (no Payload, no
// I/O) so they can be tested.
//
// Rules (owner decision 9 Oct 2026, docs/DECISIONS.md):
// - The distributor's certificate always names the original manufacturer and its address, refers to
//   the manufacturer's certificate by number, and attaches it (ICH Q7, 11.43 and 11.44). It can never
//   be printed without them: removing the manufacturer would make the certificate false.
// - The results are the manufacturer's (or an independent laboratory's), copied, never made up.
// - The specification sheet carries tests and limits only: no batch, no results, no manufacturer.

export type CoaTest = { test: string; criteria?: string | null; result?: string | null; method?: string | null }

export type CoaDoc = {
  number: string
  issueDate: string
  productName: string
  grade?: string | null
  specification?: string | null
  casNo?: string | null
  batchNo?: string | null
  batchSize?: string | null
  quantitySupplied?: string | null
  mfgDate?: string | null
  expiryDate?: string | null
  expiryKind?: 'expiry' | 'retest' | null
  packaging?: string | null
  storage?: string | null
  customerName?: string | null
  customerRef?: string | null
  manufacturerName?: string | null
  manufacturerAddress?: string | null
  manufacturerPhone?: string | null
  originalCoaNo?: string | null
  originalCoaDate?: string | null
  resultsSource?: 'manufacturer' | 'lab' | null
  labName?: string | null
  labAddress?: string | null
  labPhone?: string | null
  labReportNo?: string | null
  labReportDate?: string | null
  // What the distributor did with the goods: confirmed by the user, printed in the statement.
  handling?: 'unchanged' | 'repacked' | null
  // Whether the manufacturer's certificate is appended to the PDF. Always for APIs and excipients
  // (ICH Q7 17.6); optional for other materials, where it stays on file and is available on request.
  attachOriginal?: boolean | null
  conclusion?: string | null
  remarks?: string | null
  specNotes?: string | null
  productType?: string | null
  // The releasing company's licence, printed under the details when it is set.
  licence?: string | null
  tests: CoaTest[]
}

export type Issuer = {
  companyName: string
  brandName?: string | null
  address?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  signatoryName?: string | null
  signatoryTitle?: string | null
  logo?: { data: Uint8Array; type: 'png' | 'jpg' } | null
}

// What AI read, kept to show later changes: the tests, the identity fields and the file read.
export const WATCHED = ['productName', 'batchNo', 'manufacturerName', 'manufacturerAddress', 'originalCoaNo', 'originalCoaDate', 'mfgDate', 'expiryDate'] as const
export type Reading = { tests?: CoaTest[]; fields?: Partial<Record<(typeof WATCHED)[number], string>>; sourceFile?: string | number | null; sha256?: string; at?: string; model?: string }

// The state of the uploaded original: fine, missing, or a reason it cannot be attached.
export type OriginalState = { ok: true } | { ok: false; problem: string }

const t = (v: unknown) => (v == null ? '' : String(v).trim())

// The kinds of product a certificate can be for, and the licences a company can hold.
export const PRODUCT_TYPES = [
  { label: 'Active pharmaceutical ingredients (API)', value: 'api' },
  { label: 'Excipients', value: 'excipient' },
  { label: 'Finished medicines', value: 'finished' },
  { label: 'Medical devices', value: 'device' },
  { label: 'Chemicals (not for medicines)', value: 'chemical' },
  { label: 'Other', value: 'other' },
]
export const LICENCE_KINDS = [
  { label: 'Drug distribution / wholesale licence', value: 'drug-distribution' },
  { label: 'Pharmaceutical import or export licence', value: 'pharma-import-export' },
  { label: 'Medical device distribution licence', value: 'device-distribution' },
  { label: 'GDP or GMP certificate', value: 'gdp-gmp' },
  { label: 'Hazardous chemicals licence', value: 'chemicals' },
  { label: 'Business licence with import/export scope (export only)', value: 'export-trading' },
  { label: 'Business licence (trading scope)', value: 'business' },
  { label: 'Other', value: 'other' },
]
export type Licence = { kind?: string | null; number?: string | null; authority?: string | null; validFrom?: string | null; validUntil?: string | null; covers?: string[] | null; printOnCertificate?: boolean | null }

// A day picked in the admin. Payload stores it at 12:00 UTC on that day; a value written by code
// can also be local midnight in UTC (China: 16:00 the day before) or a plain YYYY-MM-DD. Rounding to
// the nearest UTC midnight, with exactly noon going back to its own day, gives the picked day.
// Today's date in China, where the certificates are issued (the server clock is UTC).
export const todayInChina = (now = new Date()): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)

export const pickedDay = (v: unknown): string => {
  const raw = String(v ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const ms = Date.parse(raw)
  const DAY = 86_400_000
  return Number.isNaN(ms) ? raw.slice(0, 10) : new Date(Math.floor((ms + DAY / 2 - 1) / DAY) * DAY).toISOString().slice(0, 10)
}

const labelOf = (list: { label: string; value: string }[], v: unknown) => list.find((x) => x.value === v)?.label ?? String(v ?? '')
export const productTypeLabel = (v: unknown) => labelOf(PRODUCT_TYPES, v)

// Which licences may release which kinds of product. A business or chemicals licence never
// releases a medicine, an API or a device.
const KIND_ALLOWS: Record<string, string[]> = {
  // A Chinese trading company exports APIs and excipients under 货物进出口 in its business scope and
  // its customs registration (owner decision 10 Oct 2026); finished medicines still need a drug licence.
  api: ['drug-distribution', 'pharma-import-export', 'gdp-gmp', 'export-trading'],
  excipient: ['drug-distribution', 'pharma-import-export', 'gdp-gmp', 'export-trading'],
  finished: ['drug-distribution', 'pharma-import-export', 'gdp-gmp'],
  device: ['device-distribution'],
  chemical: ['chemicals', 'business', 'export-trading'],
  other: ['drug-distribution', 'pharma-import-export', 'gdp-gmp', 'device-distribution', 'export-trading', 'chemicals', 'business', 'other'],
}

// The licence that lets a company release a certificate for this kind of product on this date:
// it covers the product type and is valid on the date. Licences that are printed come first.
export function pickLicence(licences: Licence[] | null | undefined, productType: string | null | undefined, onDate: string): { licence: Licence } | { problem: string } {
  if (!productType) return { problem: 'the kind of product (API, excipient...)' }
  const day = onDate.slice(0, 10)
  const covering = (licences ?? []).filter((l) => (l.covers ?? []).includes(productType) && (KIND_ALLOWS[productType] ?? []).includes(String(l.kind ?? '')) && /[A-Za-z0-9]/.test(String(l.number ?? '')))
  if (!covering.length) return { problem: `a company with a licence covering ${labelOf(PRODUCT_TYPES, productType).toLowerCase()} (Our companies > Licences)` }
  const valid = covering.filter((l) => (!l.validFrom || pickedDay(l.validFrom) <= day) && (!l.validUntil || pickedDay(l.validUntil) >= day))
  if (!valid.length) return { problem: `a valid licence: the company's licence for ${labelOf(PRODUCT_TYPES, productType).toLowerCase()} is expired or not yet valid on ${day}` }
  valid.sort((a, b) => Number(Boolean(b.printOnCertificate)) - Number(Boolean(a.printOnCertificate)))
  return { licence: valid[0] }
}

export function licenceLine(l: Licence): string {
  return [labelOf(LICENCE_KINDS, l.kind), `No. ${String(l.number ?? '').trim()}`, String(l.authority ?? '').trim(), l.validUntil ? `valid until ${pickedDay(l.validUntil)}` : ''].filter(Boolean).join(', ')
}
const norm = (v: unknown) => t(v).replace(/\s+/g, ' ').toLowerCase()

// The prefix of an issuing company's certificate numbers: 2 to 8 capital letters or digits.
export function cleanPrefix(p: unknown, fallback = 'NJMC'): string {
  const v = t(p).toUpperCase().replace(/[^A-Z0-9]/g, '')
  return /^[A-Z0-9]{2,8}$/.test(v) ? v : fallback
}

export function coaNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}-COA-${year}-${String(seq).padStart(4, '0')}`
}

export function nextCoaSeq(existing: (string | null | undefined)[], prefix: string, year: number): number {
  const re = new RegExp(`^${prefix}-COA-${year}-(\\d+)$`)
  return existing.reduce((max, n) => Math.max(max, Number(re.exec(t(n))?.[1] ?? 0)), 0) + 1
}

// Characters the PDF fonts cannot print (Chinese, Arabic): the text must be in English. The listed
// symbols are printable because latin() in trade-pdf.ts replaces them (<=, >=, alpha, degree C...).
const PRINTABLE = [
  0x2018, 0x2019, 0x201c, 0x201d, 0x2013, 0x2014, 0x2026, 0x2264, 0x2265, 0x2030, 0x2212, 0x2103,
  0x03b1, 0x03b2, 0x03b3, 0x03bc, 0xff08, 0xff09, 0xff0c, 0xff1a, 0xff5e,
].map((c) => String.fromCharCode(c)).join('')
export const NOT_LATIN = new RegExp(`[^\\n\\t\\x20-\\x7E\\xA0-\\xFF${PRINTABLE}]`)

const LABELS: Record<string, string> = {
  productName: 'product name', grade: 'grade', specification: 'specification', casNo: 'CAS No.', batchNo: 'batch No.', batchSize: 'batch size',
  quantitySupplied: 'quantity supplied', mfgDate: 'manufacturing date', expiryDate: 'expiry date', packaging: 'packaging', storage: 'storage',
  customerName: 'customer', customerRef: 'customer reference', manufacturerName: 'manufacturer name', manufacturerAddress: 'manufacturer address',
  manufacturerPhone: 'manufacturer telephone', licence: 'licence', originalCoaNo: "manufacturer's certificate No.", originalCoaDate: "manufacturer's certificate date",
  labName: 'laboratory', labAddress: 'laboratory address', labPhone: 'laboratory telephone', labReportNo: 'report No.', labReportDate: 'report date',
  conclusion: 'conclusion', remarks: 'remarks', specNotes: 'specification remarks',
}
const SPEC_FIELDS = ['productName', 'grade', 'specification', 'casNo', 'storage', 'packaging', 'specNotes']

function nonLatin(d: CoaDoc, fields: string[], withResults: boolean, issuer?: Issuer): string[] {
  const rec = d as unknown as Record<string, unknown>
  const out = fields.filter((k) => NOT_LATIN.test(t(rec[k]))).map((k) => LABELS[k] ?? k)
  d.tests.forEach((x, i) => {
    if ([x.test, x.criteria, withResults ? x.result : '', x.method].some((v) => NOT_LATIN.test(t(v)))) out.push(`test row ${i + 1}`)
  })
  if (issuer && [issuer.companyName, issuer.brandName, issuer.address, issuer.signatoryName, issuer.signatoryTitle].some((v) => NOT_LATIN.test(t(v)))) out.push('the letterhead company details')
  return out
}

// Two names of the same company: legal suffixes and punctuation ignored, one inside the other.
const SUFFIX = /\b(co|company|ltd|limited|inc|llc|corp|corporation|gmbh|plc|sa|pvt|private|group)\b/g
const core = (v: unknown) => norm(v).replace(/[.,()&-]/g, ' ').replace(SUFFIX, ' ').replace(/\s+/g, ' ').trim()
export function sameCompany(a: unknown, b: unknown): boolean {
  const x = core(a)
  const y = core(b)
  return Boolean(x && y) && (x === y || (x.length >= 4 && y.includes(x)) || (y.length >= 4 && x.includes(y)))
}

// A real company name: letters, not a placeholder, not the issuer itself, not the trader that sent it.
function manufacturerProblem(name: string, issuer?: Issuer, issuedBy?: string | null): string | null {
  if (!name) return 'the name of the original manufacturer'
  if (!/[A-Za-z]{3,}/.test(name) || /^(n\/?a|none|nil|unknown|see attach\w*|as attached|tbd|tba|same as above)\.?$/i.test(name)) return 'the real name of the original manufacturer (not a placeholder)'
  if (issuer && (sameCompany(name, issuer.companyName) || sameCompany(name, issuer.brandName))) return 'the original manufacturer, not the letterhead company'
  if (issuedBy && sameCompany(name, issuedBy)) return 'the original manufacturer, not the trader that sent the certificate'
  return null
}

// What stops the distributor's certificate from being printed. Empty list = ready.
export function coaGaps(d: CoaDoc, original: OriginalState, ctx: { issuer?: Issuer; issuedBy?: string | null; reading?: Reading | null; sourceFile?: string | number | null; fileSha256?: string | null; licenceProblem?: string | null } = {}): string[] {
  const g: string[] = []
  if (ctx.licenceProblem) g.push(ctx.licenceProblem)
  if (!original.ok) g.push(original.problem)
  if (mustAttach(d.productType) && d.attachOriginal === false) g.push(`the manufacturer's certificate must be attached for ${productTypeLabel(d.productType).toLowerCase()} (ICH Q7 17.6)`)
  if (ctx.reading?.sourceFile != null && ctx.sourceFile != null && String(ctx.reading.sourceFile) !== String(ctx.sourceFile)) {
    g.push('the supplier file was changed after the AI reading: read the new file again')
  } else if (ctx.reading?.sha256 && ctx.fileSha256 && ctx.reading.sha256 !== ctx.fileSha256) {
    g.push('the supplier file was replaced inside its document after the AI reading: read it again')
  }
  if (!t(d.productName)) g.push('the product name')
  if (!t(d.batchNo)) g.push('the batch number')
  const m = manufacturerProblem(t(d.manufacturerName), ctx.issuer, ctx.issuedBy)
  if (m) g.push(m)
  if (!/[A-Za-z]{3,}/.test(t(d.manufacturerAddress))) g.push("the manufacturer's address")
  if (!/\d{5,}/.test(t(d.manufacturerPhone).replace(/\D/g, ''))) g.push("the manufacturer's telephone (ICH Q7 11.43)")
  if (!/[A-Za-z0-9]{2,}/.test(t(d.originalCoaNo))) g.push("the number of the manufacturer's certificate")
  if (d.resultsSource === 'lab') {
    if (!t(d.labName) || !t(d.labReportNo)) g.push("the laboratory's name and report number")
    if (!t(d.labAddress) || !/\d{5,}/.test(t(d.labPhone).replace(/\D/g, ''))) g.push("the laboratory's address and telephone (ICH Q7 11.44)")
  }
  if (d.handling !== 'unchanged' && d.handling !== 'repacked') g.push('whether the goods were repacked or relabelled')
  const rows = d.tests.filter((x) => t(x.test))
  if (!rows.length) g.push('the test results')
  else if (rows.some((x) => !t(x.result))) g.push('a result in every test row')
  const foreign = nonLatin(d, Object.keys(LABELS).filter((k) => k !== 'specNotes'), true, ctx.issuer)
  if (foreign.length) g.push(`English text in: ${foreign.join(', ')} (the PDF prints Latin letters only)`)
  return g
}

// What stops the specification sheet. It needs far less: product and the tests with their limits.
export function specGaps(d: CoaDoc, issuer?: Issuer): string[] {
  const g: string[] = []
  if (!t(d.productName)) g.push('the product name')
  const rows = d.tests.filter((x) => t(x.test))
  if (!rows.length) g.push('the tests')
  else if (rows.some((x) => !t(x.criteria))) g.push('an acceptance criterion in every test row')
  const foreign = nonLatin(d, SPEC_FIELDS, false, issuer)
  if (foreign.length) g.push(`English text in: ${foreign.join(', ')} (the PDF prints Latin letters only)`)
  return g
}

// The legal company, with the brand it trades under: "Medicayal Pharma Co., Ltd. (NJMC Medical Supplies)".
export const legalWithBrand = (i: Pick<Issuer, 'companyName' | 'brandName'>) => (String(i.brandName ?? '').trim() ? `${i.companyName} (${String(i.brandName).trim()})` : i.companyName)

// Whether the manufacturer's certificate must be appended: yes for pharmaceutical materials.
export const mustAttach = (productType: string | null | undefined) => productType === 'api' || productType === 'excipient' || productType === 'finished'
export const attaches = (d: Pick<CoaDoc, 'productType' | 'attachOriginal'>) => mustAttach(d.productType) || d.attachOriginal !== false

// The short statement printed under the results: whose results, our role, where the original is.
// The manufacturer's name, address and telephone are already in the box above, so they are not repeated.
export function coaStatement(d: CoaDoc, issuer: Issuer, attachedPages: number, photo = false): string {
  const orig = `certificate of analysis No. ${t(d.originalCoaNo)}${t(d.originalCoaDate) ? ` dated ${t(d.originalCoaDate)}` : ''}`
  const where = attaches(d)
    ? (photo ? 'It is attached, photographed, as the last page.' : `It is attached unchanged as the last ${attachedPages === 1 ? 'page' : `${attachedPages} pages`}.`)
    : `It is held on file by ${issuer.companyName} and is available on request.`
  const role = `${legalWithBrand(issuer)} supplies this batch as distributor${d.handling === 'repacked' ? ', repacked or relabelled as stated above' : ' in the manufacturer\'s original packaging'}.`
  if (d.resultsSource === 'lab') {
    return `Results from report No. ${t(d.labReportNo)}${t(d.labReportDate) ? ` dated ${t(d.labReportDate)}` : ''} of ${t(d.labName)} on a sample of this batch; the manufacturer released the batch with its ${orig}. ${where} ${role}`
  }
  return `Results copied without change from the manufacturer's ${orig}. ${where} ${role}`
}

// What the user changed after the AI reading. Corrections are allowed (AI can misread), but each one
// shows as a warning so a changed result is always a conscious decision. Rows compare by position.
export function changedFromReading(read: Reading | null | undefined, now: CoaDoc): string[] {
  if (!read?.tests?.length) return []
  const out: string[] = []
  const rec = now as unknown as Record<string, unknown>
  for (const k of WATCHED) {
    const was = t(read.fields?.[k])
    if (read.fields && k in read.fields && norm(was) !== norm(rec[k])) out.push(`${LABELS[k]}: read as "${was}", now "${t(rec[k])}"`)
  }
  const rows = now.tests.filter((x) => t(x.test))
  const n = Math.max(read.tests.length, rows.length)
  for (let i = 0; i < n; i++) {
    const r = read.tests[i]
    const x = rows[i]
    if (!x) out.push(`row ${i + 1} "${t(r?.test)}" was removed`)
    else if (!r) out.push(`row ${i + 1} "${t(x.test)}" was not on the reading`)
    else if (norm(r.test) !== norm(x.test)) out.push(`row ${i + 1}: test read as "${t(r.test)}", now "${t(x.test)}"`)
    else if (norm(r.result) !== norm(x.result)) out.push(`row ${i + 1} "${t(x.test)}": result read as "${t(r.result)}", now "${t(x.result)}"`)
    else if (norm(r.criteria) !== norm(x.criteria)) out.push(`row ${i + 1} "${t(x.test)}": limit read as "${t(r.criteria)}", now "${t(x.criteria)}"`)
  }
  return out
}

// ── AI reading of the supplier's certificate ─────────────────────────────────────────────────

export type CoaReading = {
  productName: string; grade: string; specification: string; casNo: string
  batchNo: string; batchSize: string; mfgDate: string; expiryDate: string; expiryKind: string
  manufacturerName: string; manufacturerAddress: string; manufacturerPhone: string; issuedBy: string; originalCoaNo: string; originalCoaDate: string
  packaging: string; storage: string; conclusion: string
  tests: { test: string; criteria: string; result: string; method: string }[]
  notes: string
}

const str = (description?: string) => (description ? { type: 'string', description } : { type: 'string' })

export const COA_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['productName', 'grade', 'specification', 'casNo', 'batchNo', 'batchSize', 'mfgDate', 'expiryDate', 'expiryKind', 'manufacturerName', 'manufacturerAddress', 'manufacturerPhone', 'issuedBy', 'originalCoaNo', 'originalCoaDate', 'packaging', 'storage', 'conclusion', 'tests', 'notes'],
  properties: {
    productName: str(), grade: str('e.g. USP, EP, BP, injection grade; empty if not printed'),
    specification: str('The standard the batch was tested to, e.g. USP 2025, EP 11.0, in-house; as printed'),
    casNo: str(), batchNo: str(), batchSize: str('with unit'),
    mfgDate: str('YYYY-MM-DD when the full date is printed, else as printed'), expiryDate: str('YYYY-MM-DD when the full date is printed, else as printed'),
    expiryKind: { type: 'string', enum: ['expiry', 'retest', ''] },
    manufacturerName: str('The company that MANUFACTURED the batch, in English (official English name if printed, else a faithful transliteration). Empty if the document does not say who manufactured it'),
    manufacturerAddress: str('The manufacturing site address, in English. Empty if not printed'),
    manufacturerPhone: str("The manufacturer's telephone if printed"),
    issuedBy: str('The company that issued this document, if different from the manufacturer (a trader); else empty'),
    originalCoaNo: str('The number of this certificate or report as printed'), originalCoaDate: str('Date of issue or report date, YYYY-MM-DD when complete'),
    packaging: str(), storage: str(), conclusion: str('The overall conclusion as printed, in English'),
    tests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['test', 'criteria', 'result', 'method'],
        properties: {
          test: str('Test name in English pharmacopoeial wording; for a sub-test write "Related substances: impurity A"'),
          criteria: str('Acceptance criterion exactly as printed (numbers, units, signs), in English'),
          result: str('Result exactly as printed (numbers, units, signs), in English; "Complies" if printed as such'),
          method: str('Method or chapter if printed, e.g. USP <621>, HPLC; else empty'),
        },
      },
    },
    notes: str('Anything unclear, unreadable, handwritten, stamped or missing, in English, for the person checking'),
  },
} as const

export const COA_SYSTEM = `You read a supplier's certificate of analysis for a pharmaceutical material and copy it into fields.
Copy only what the document shows. Never estimate, complete, round or correct a value, and never fill a field the document does not show: leave it empty and mention it in notes.
Translate Chinese or other languages into English using pharmacopoeial wording, but keep every number, unit, sign and limit exactly as printed (write <= and >= for the inequality signs).
Keep the test rows in the order printed. One row per printed result: a test with several printed results (for example several impurities) becomes several rows.
If the document was issued by a trader, put the trader in issuedBy and the manufacturer in manufacturerName only if the document names the manufacturer.`

// The reading, cleaned: strings only, trimmed, tests without a name dropped.
export function cleanReading(r: Partial<CoaReading> | null | undefined): CoaReading {
  const s = (v: unknown, n = 400) => t(v).slice(0, n)
  return {
    productName: s(r?.productName, 200), grade: s(r?.grade, 120), specification: s(r?.specification, 200), casNo: s(r?.casNo, 40),
    batchNo: s(r?.batchNo, 80), batchSize: s(r?.batchSize, 80), mfgDate: s(r?.mfgDate, 40), expiryDate: s(r?.expiryDate, 40),
    expiryKind: ['expiry', 'retest'].includes(t(r?.expiryKind)) ? t(r?.expiryKind) : '',
    manufacturerName: s(r?.manufacturerName, 200), manufacturerAddress: s(r?.manufacturerAddress, 400), manufacturerPhone: s(r?.manufacturerPhone, 60), issuedBy: s(r?.issuedBy, 200),
    originalCoaNo: s(r?.originalCoaNo, 80), originalCoaDate: s(r?.originalCoaDate, 40),
    packaging: s(r?.packaging, 200), storage: s(r?.storage, 200), conclusion: s(r?.conclusion, 400),
    tests: (Array.isArray(r?.tests) ? r.tests : [])
      .map((x) => ({ test: s(x?.test, 200), criteria: s(x?.criteria, 400), result: s(x?.result, 200), method: s(x?.method, 120) }))
      .filter((x) => x.test)
      .slice(0, 120),
    notes: s(r?.notes, 2000),
  }
}
