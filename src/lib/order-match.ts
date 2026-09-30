// Order matching: finds, for every material in a customer order, the products in the Catalogue
// database and the suppliers behind them. Pure functions (no Payload, no I/O) so they can be tested.
//
// Two ways a material is recognised:
// 1. Order rows (Excel/CSV with a product column, or one line per material): each row is matched
//    to products by CAS number, then by name or other name, then by the same base molecule in a
//    different salt or form.
// 2. The whole order text is scanned for every product name and CAS number in the database, so a
//    material mentioned in a letter or PDF is still found even when the rows cannot be separated.

export type OrderRow = { text: string; cas?: string; grade?: string; quantity?: string; row?: number; fromText?: boolean }

export type CatalogueProduct = {
  id: number | string
  name: string
  otherNames?: string | null
  cas?: string | null
  grades?: string[] | null
  sources: { supplierId: number | string; supplierName: string; documents?: string | null; marketStatus?: string | null }[]
}

export type Match = {
  productId: CatalogueProduct['id']
  productName: string
  how: 'CAS number' | 'name' | 'other name' | 'name inside a longer name (check)' | 'same molecule, other salt or form (check)'
  score: number
}

export type OrderLine = { requested: string; cas?: string; grade?: string; quantity?: string; row?: number; matches: Match[] }

const CAS_RE = /\b(\d{2,7}-\d{2}-\d)\b/g

export function casValid(cas: string): boolean {
  const m = /^(\d{2,7})-(\d{2})-(\d)$/.exec(cas)
  if (!m) return false
  const digits = (m[1] + m[2]).split('').reverse()
  const sum = digits.reduce((s, d, i) => s + (i + 1) * Number(d), 0)
  return sum % 10 === Number(m[3])
}

export function findCas(text: string): string[] {
  return [...new Set([...text.matchAll(CAS_RE)].map((m) => m[1]).filter(casValid))]
}

// Spelling variants that mean the same substance.
const SYNONYMS: [RegExp, string][] = [
  [/\bhydrochloride\b|\bhcl\b/g, 'hcl'],
  [/\bhydrobromide\b|\bhbr\b/g, 'hbr'],
  [/\bsulphate\b/g, 'sulfate'],
  [/\bsulphur\b/g, 'sulfur'],
  [/\bmesylate\b/g, 'mesilate'],
  [/\bbesylate\b/g, 'besilate'],
  [/\bcolour\b/g, 'color'],
  [/\baluminium\b/g, 'aluminum'],
  [/\bcaesium\b/g, 'cesium'],
]
// Salt, hydrate and form words: removed to find "the same molecule in another form".
const FORM_WORDS = new Set(
  ('hcl hbr sodium potassium calcium magnesium zinc sulfate phosphate acetate citrate maleate fumarate tartrate mesilate besilate ' +
    'succinate tosylate lactate gluconate chloride bromide base monohydrate dihydrate trihydrate hemihydrate hydrate anhydrous ' +
    'sterile micronized micronised powder granules granular crystalline amorphous usp ep bp jp chp cp ip grade api pure').split(' '),
)
// Words that do not identify a substance on their own (counter-ions stripped from "magnesium oxide"
// leave "oxide"): never match on these alone.
const GENERIC = new Set(
  ('oxide oxides carbonate stearate sulfate phosphate chloride hydroxide citrate acetate lactate gluconate starch cellulose ' +
    'water talc lake red yellow blue green black white brown orange violet pink color colors pigment dye salt acid ester oil ' +
    'extract powder solution gum wax glycol alcohol sugar').split(' '),
)
// Order noise removed before comparing a row with a product name. Numbers with a unit are always
// quantities; a bare number is dropped only when the product name has no number of its own
// (so "Polysorbate 20" never equals "Polysorbate 80").
const NOISE = /\b(\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|mg|mt|t|ton|tons|tonnes|l|litre|liter|drums?|bags?|%)|usp|ep|bp|jp|chp|cp|ip|ph|grade|api|qty|quantity|pharma|pharmaceutical|no)\b/g
function core(s: string, keepNumbers = false): string {
  let t = normName(s).replace(NOISE, ' ')
  if (!keepNumbers) t = t.replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}
function distinctive(n: string): boolean {
  const words = n.split(' ')
  return n.length >= 6 && !(words.length === 1 && GENERIC.has(words[0])) && !words.every((w) => GENERIC.has(w) || FORM_WORDS.has(w))
}

export function normName(s: string): string {
  let t = (s || '').toLowerCase().replace(/[\u2013\u2014]/g, '-')
  t = t.replace(/\([^)]*\)/g, ' ')
  for (const [re, to] of SYNONYMS) t = t.replace(re, to)
  return t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

export function baseName(s: string): string {
  return normName(s)
    .split(' ')
    .filter((w) => w && !FORM_WORDS.has(w))
    .join(' ')
}

function names(p: CatalogueProduct): { n: string; other: boolean }[] {
  const out = [{ n: p.name, other: false }]
  for (const o of (p.otherNames || '').split(/[;,/]| or /)) if (o.trim()) out.push({ n: o.trim(), other: true })
  return out
}

export type ProductIndex = { byCas: Map<string, CatalogueProduct[]>; list: { p: CatalogueProduct; norm: string; base: string; other: boolean }[] }

export function buildIndex(products: CatalogueProduct[]): ProductIndex {
  const byCas = new Map<string, CatalogueProduct[]>()
  const list: ProductIndex['list'] = []
  for (const p of products) {
    for (const c of findCas(p.cas || '')) byCas.set(c, [...(byCas.get(c) || []), p])
    for (const { n, other } of names(p)) {
      const norm = normName(n)
      if (norm.length >= 3) list.push({ p, norm, base: baseName(n), other })
    }
  }
  return { byCas, list }
}

function add(matches: Map<CatalogueProduct['id'], Match>, p: CatalogueProduct, how: Match['how'], score: number) {
  const cur = matches.get(p.id)
  if (!cur || cur.score < score) matches.set(p.id, { productId: p.id, productName: p.name, how, score })
}

export function matchRow(row: OrderRow, idx: ProductIndex): Match[] {
  const matches = new Map<CatalogueProduct['id'], Match>()
  for (const c of new Set([...(row.cas ? findCas(row.cas) : []), ...findCas(row.text)])) {
    for (const p of idx.byCas.get(c) || []) add(matches, p, 'CAS number', 100)
  }
  const plain = core(row.text)
  const withNums = core(row.text, true)
  for (const e of idx.list) {
    const nums = /\d/.test(e.norm)
    const c = nums ? withNums : plain
    const b = baseName(c)
    const words = ` ${c} `
    const ec = core(e.norm, nums)
    if (ec && ec === c) add(matches, e.p, e.other ? 'other name' : 'name', 95)
    else if (distinctive(ec) && ec.includes(' ') && words.includes(` ${ec} `)) add(matches, e.p, 'name inside a longer name (check)', 70)
    else if (b && e.base === b && distinctive(b)) add(matches, e.p, 'same molecule, other salt or form (check)', 60)
  }
  // Keep the best kind of match: if the exact product is found, drop other-salt guesses.
  const all = [...matches.values()].sort((a, z) => z.score - a.score)
  const best = all[0]?.score ?? 0
  return all.filter((m) => best < 80 || m.score >= 80)
}

// Scan free text (letters, PDFs) for any known product name or CAS number.
export function scanText(text: string, idx: ProductIndex): OrderLine[] {
  const norm = ` ${normName(text)} `
  const found = new Map<string, OrderLine>()
  for (const c of findCas(text)) {
    const ps = idx.byCas.get(c) || []
    const key = `cas:${c}`
    found.set(key, { requested: ps[0]?.name ? `${ps[0].name} (CAS ${c})` : `CAS ${c}`, cas: c, matches: ps.map((p) => ({ productId: p.id, productName: p.name, how: 'CAS number' as const, score: 100 })) })
  }
  for (const e of idx.list) {
    if (!distinctive(e.norm) || !norm.includes(` ${e.norm} `)) continue
    const already = [...found.values()].some((l) => l.matches.some((m) => m.productId === e.p.id))
    if (already) continue
    const key = `name:${normName(e.p.name)}`
    const line = found.get(key) || { requested: e.p.name, matches: [] }
    line.matches.push({ productId: e.p.id, productName: e.p.name, how: e.other ? 'other name' : 'name', score: 90 })
    found.set(key, line)
  }
  return [...found.values()]
}

export function matchOrder(rows: OrderRow[], fullText: string, products: CatalogueProduct[]): OrderLine[] {
  const idx = buildIndex(products)
  // Lines from letters, Word or PDF files are kept only when they look like an order line: a match,
  // a CAS number or a quantity. Greetings and addresses are dropped. Table rows are always kept.
  const QTY = /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|mg|mt|t|ton|tons|tonnes|l|litre|liter|drums?|bags?)\b/i
  const lines: OrderLine[] = rows
    .map((r) => ({ requested: r.text.replace(/^[-*\u2022\s\d.)]+(?=[A-Za-z])/, '').trim(), cas: r.cas, grade: r.grade, quantity: r.quantity, row: r.row, matches: matchRow(r, idx), fromText: r.fromText }))
    .filter((l) => !l.fromText || l.matches.length || findCas(l.requested).length || QTY.test(l.requested))
    .map((l) => {
      delete l.fromText
      return l
    })
  // Materials mentioned anywhere in the text but not on a recognised row.
  const seen = new Set(lines.flatMap((l) => l.matches.map((m) => m.productId)))
  for (const l of scanText(fullText, idx)) {
    const fresh = l.matches.filter((m) => !seen.has(m.productId))
    if (fresh.length || (l.cas && !l.matches.length && !lines.some((x) => x.cas === l.cas || x.requested.includes(l.cas!)))) {
      lines.push({ ...l, matches: fresh })
      fresh.forEach((m) => seen.add(m.productId))
    }
  }
  return lines
}
