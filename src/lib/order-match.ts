// Order matching: finds, for every material in a customer order, the products in the Catalogue
// database and the suppliers behind them. Pure functions (no Payload, no I/O) so they can be tested.
//
// A row is matched to products by, in order of confidence:
//   CAS number > name / other name > standard synonym > close spelling > name inside a longer name
//   > same molecule in another salt or form.
// Everything below an exact name is labelled "(check)" so the user confirms before quoting.
// Free text (letters, PDFs) is also scanned for known product names; table orders are not, because
// their rows already list every material.

export type OrderRow = {
  text: string
  cas?: string
  grade?: string
  quantity?: string
  row?: number
  fromText?: boolean
  // Alternative names the customer wrote in brackets anywhere on the row, e.g. "(Carbomer 940)".
  aliases?: string[]
}

export type CatalogueProduct = {
  id: number | string
  name: string
  otherNames?: string | null
  cas?: string | null
  grades?: string[] | null
  sources: { supplierId: number | string; supplierName: string; documents?: string | null; marketStatus?: string | null }[]
}

export type MatchHow =
  | 'CAS number'
  | 'name'
  | 'other name'
  | 'name in brackets (check)'
  | 'synonym (check)'
  | 'close spelling (check)'
  | 'name inside a longer name (check)'
  | 'same molecule, other salt or form (check)'

export type Match = { productId: CatalogueProduct['id']; productName: string; how: MatchHow; score: number }

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

// Spelling variants of the same word (always applied).
const SPELLING: [RegExp, string][] = [
  [/\bhydrochloride\b|\bhcl\b/g, 'hcl'],
  [/\bhydrobromide\b|\bhbr\b/g, 'hbr'],
  [/\bsulphate\b/g, 'sulfate'],
  [/\bsulphur\b/g, 'sulfur'],
  [/\bmesylate\b/g, 'mesilate'],
  [/\bbesylate\b/g, 'besilate'],
  [/\bcolour\b/g, 'color'],
  [/\baluminium\b/g, 'aluminum'],
  [/\bcaesium\b/g, 'cesium'],
  [/\bparaffine\b/g, 'paraffin'],
  [/\bvaseline\b/g, 'vaselin'],
  [/\bglycerine\b|\bglycerin\b/g, 'glycerol'],
]
// Standard pharmaceutical synonyms (BAN / USAN / INN and common trade-style names). A match that
// needs one of these is labelled "synonym (check)".
const SYNONYMS: [RegExp, string][] = [
  [/\b(white |yellow )?(petroleum jelly|soft paraffin|petrolatum|vaselin)\b/g, '$1petrolatum'],
  [/\b(liquid paraffin|mineral oil|paraffin oil|paraffinum liquidum)\b/g, 'liquid paraffin'],
  [/\b(d panthenol|dexapanthenol|dexpanthenol)\b/g, 'dexpanthenol'],
  [/\bpcmx\b/g, 'chloroxylenol'],
  [/\b(sles|sodium lauryl ether sulfate|sodium laureth sulfate)\b/g, 'sodium laureth sulfate'],
  [/\b(sls|sodium dodecyl sulfate|sodium lauryl sulfate)\b/g, 'sodium lauryl sulfate'],
  [/\b(carbopol|acrypol)\b/g, 'carbomer'],
  [/\b(vitamin e acetate|tocopheryl acetate|tocopherol acetate)\b/g, 'tocopheryl acetate'],
  [/\b(acetaminophen|paracetamol)\b/g, 'paracetamol'],
  [/\b(albuterol|salbutamol)\b/g, 'salbutamol'],
  [/\b(lignocaine|lidocaine)\b/g, 'lidocaine'],
  [/\b(dibucaine|cinchocaine)\b/g, 'cinchocaine'],
  [/\b(frusemide|furosemide)\b/g, 'furosemide'],
  [/\b(adrenaline|epinephrine)\b/g, 'epinephrine'],
  [/\b(hpmc|hydroxypropyl methylcellulose|hydroxypropylmethylcellulose|hypromellose)\b/g, 'hypromellose'],
  [/\b(mcc|microcrystalline cellulose)\b/g, 'microcrystalline cellulose'],
  [/\b(cetearyl alcohol|cetostearyl alcohol)\b/g, 'cetostearyl alcohol'],
  [/\b(bees wax|beeswax)\b/g, 'beeswax'],
  [/\b(sodium fucidate|fusidate sodium|sodium fusidate)\b/g, 'sodium fusidate'],
  [/\b(dibasic sodium phosphate|sodium phosphate dibasic|disodium hydrogen phosphate|disodium phosphate)\b/g, 'disodium hydrogen phosphate'],
  [/\b(monobasic sodium phosphate|sodium phosphate monobasic|sodium dihydrogen phosphate)\b/g, 'sodium dihydrogen phosphate'],
  [/\b(dibasic calcium phosphate|calcium hydrogen phosphate|dicalcium phosphate)\b/g, 'dicalcium phosphate'],
  [/\b(titanium dioxide|titania)\b/g, 'titanium dioxide'],
  [/\b(povidone|polyvinylpyrrolidone|pvp)\b/g, 'povidone'],
  [/\b(macrogol|polyethylene glycol|peg)\b/g, 'polyethylene glycol'],
  [/\b(vitamin c|ascorbic acid)\b/g, 'ascorbic acid'],
  [/\b(vitamin b1|thiamine)\b/g, 'thiamine'],
  [/\b(vitamin b6|pyridoxine)\b/g, 'pyridoxine'],
  [/\b(vitamin b12|cyanocobalamin)\b/g, 'cyanocobalamin'],
]
// Salt, hydrate and form words: removed to find "the same molecule in another form".
const FORM_WORDS = new Set(
  ('hcl hbr sodium potassium calcium magnesium zinc sulfate phosphate acetate citrate maleate fumarate tartrate mesilate besilate ' +
    'succinate tosylate lactate gluconate chloride bromide base monohydrate dihydrate trihydrate hemihydrate hydrate anhydrous ' +
    'sterile micronized micronised powder granules granular crystalline amorphous usp ep bp jp chp cp ip grade api pure valerate ' +
    'dipropionate propionate acetonide').split(' '),
)
// Words that do not identify a substance on their own: never match on these alone.
const GENERIC = new Set(
  ('oxide oxides carbonate stearate sulfate phosphate chloride hydroxide citrate acetate lactate gluconate starch cellulose ' +
    'water talc lake red yellow blue green black white brown orange violet pink color colors pigment dye salt acid ester oil ' +
    'extract powder solution gum wax glycol alcohol sugar liquid light heavy').split(' '),
)
// Order noise removed before comparing a row with a product name. Numbers with a unit are always
// quantities; a bare number is dropped only when the product name has no number of its own
// (so "Polysorbate 20" never equals "Polysorbate 80").
const NOISE =
  /\b(\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|mg|mt|t|ton|tons|tonnes|l|ml|litre|liter|drums?|bags?|%)|usp|nf|ep|bp|jp|chp|cp|ip|ph|eur|grade|api|qty|quantity|pharma|pharmaceutical|no|standard|micronized|micronised|powder|pure)\b/g

function words(s: string, synonyms: boolean): string {
  let t = (s || '').toLowerCase().replace(/[\u2013\u2014]/g, '-')
  for (const [re, to] of SPELLING) t = t.replace(re, to)
  t = t.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
  if (synonyms) for (const [re, to] of SYNONYMS) t = t.replace(re, to)
  return t.replace(/\s+/g, ' ').trim()
}

export function normName(s: string, synonyms = true): string {
  return words(s, synonyms)
}

function core(s: string, keepNumbers = false, synonyms = true): string {
  let t = words(s, synonyms).replace(NOISE, ' ')
  if (!keepNumbers) t = t.replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
  return t.replace(/\s+/g, ' ').trim()
}

function distinctive(n: string): boolean {
  const w = n.split(' ')
  return n.length >= 6 && !(w.length === 1 && GENERIC.has(w[0])) && !w.every((x) => GENERIC.has(x) || FORM_WORDS.has(x))
}

export function baseName(s: string): string {
  return normName(s)
    .split(' ')
    .filter((w) => w && !FORM_WORDS.has(w))
    .join(' ')
}

// "Mesalazine (Mesalamine)" -> ["Mesalazine", "Mesalamine"]. A chemical name that merely starts with
// a bracket, e.g. "(1-Hydroxycyclohexyl)(4-methoxyphenyl)acetonitrile", is left whole.
export function splitAlias(s: string): string[] {
  const m = /^([^()]*[A-Za-z][^()]*?)\s*\(([^()]+)\)\s*$/.exec(s.trim())
  if (!m) return [s.trim()]
  const alias = m[2].trim()
  return /[A-Za-z]{3,}/.test(alias) && !/^\d/.test(alias) ? [m[1].trim(), alias] : [m[1].trim()]
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return d[b.length]
}

// Close spelling: "ketoconazol" / "ketoconazole", "magnecium stearate" / "magnesium stearate".
// Word by word: short words (vitamin "e" vs "a") and words with digits must be identical.
function closeSpelling(a: string, b: string): boolean {
  if (a.length < 7 || b.length < 7 || Math.abs(a.length - b.length) > 2) return false
  const wa = a.split(' ')
  const wb = b.split(' ')
  if (wa.length !== wb.length) return false
  let edits = 0
  for (let i = 0; i < wa.length; i++) {
    if (wa[i] === wb[i]) continue
    if (wa[i].length < 6 || wb[i].length < 6 || /\d/.test(wa[i] + wb[i])) return false
    const d = lev(wa[i], wb[i])
    if (d > (Math.max(wa[i].length, wb[i].length) >= 8 ? 2 : 1)) return false
    edits += d
  }
  return edits > 0 && edits <= 2
}

// "tartrazine yellow color" contains "tartrazine" and the rest is only generic/form words or
// one- and two-letter tokens: the product is named, with a description around it.
function namedWithin(row: string, product: string): boolean {
  if (product.length < 6 || !distinctive(product)) return false
  const hay = ` ${row} `
  const at = hay.indexOf(` ${product} `)
  if (at < 0) return false
  const rest = (hay.slice(0, at) + ' ' + hay.slice(at + product.length + 1)).trim().split(' ').filter(Boolean)
  return rest.every((w) => w.length <= 2 || GENERIC.has(w) || FORM_WORDS.has(w) || /^\d+$/.test(w))
}

type Entry = { p: CatalogueProduct; other: boolean; nums: boolean; c: string; cNoSyn: string; base: string }
export type ProductIndex = { byCas: Map<string, CatalogueProduct[]>; list: Entry[] }

export function buildIndex(products: CatalogueProduct[]): ProductIndex {
  const byCas = new Map<string, CatalogueProduct[]>()
  const list: Entry[] = []
  for (const p of products) {
    for (const c of findCas(p.cas || '')) byCas.set(c, [...(byCas.get(c) || []), p])
    const all: { n: string; other: boolean }[] = splitAlias(p.name).map((n, i) => ({ n, other: i > 0 }))
    for (const o of (p.otherNames || '').split(/[;,/]| or /)) if (o.trim()) all.push({ n: o.trim(), other: true })
    for (const { n, other } of all) {
      const nums = /\d/.test(normName(n))
      const c = core(n, nums)
      if (c.length >= 3) list.push({ p, other, nums, c, cNoSyn: core(n, nums, false), base: baseName(n) })
    }
  }
  return { byCas, list }
}

function add(matches: Map<CatalogueProduct['id'], Match>, p: CatalogueProduct, how: MatchHow, score: number) {
  const cur = matches.get(p.id)
  if (!cur || cur.score < score) matches.set(p.id, { productId: p.id, productName: p.name, how, score })
}

export function matchRow(row: OrderRow, idx: ProductIndex): Match[] {
  const matches = new Map<CatalogueProduct['id'], Match>()
  for (const c of new Set([...(row.cas ? findCas(row.cas) : []), ...findCas(row.text)])) {
    for (const p of idx.byCas.get(c) || []) add(matches, p, 'CAS number', 100)
  }
  // Candidates: the name as written, the name without its bracket, and every bracketed alias.
  const candidates = [...new Set([row.text, ...splitAlias(row.text), ...(row.aliases ?? [])])].filter((t) => /[A-Za-z]{3,}/.test(t))
  for (const text of candidates) {
    const alias = text !== row.text && !splitAlias(row.text).slice(0, 1).includes(text)
    const forms = {
      plain: core(text),
      nums: core(text, true),
      plainNoSyn: core(text, false, false),
      numsNoSyn: core(text, true, false),
    }
    const bases = { plain: baseName(forms.plain), nums: baseName(forms.nums) }
    for (const e of idx.list) {
      const c = e.nums ? forms.nums : forms.plain
      const cNoSyn = e.nums ? forms.numsNoSyn : forms.plainNoSyn
      if (!c) continue
      if (alias) {
        // Bracketed text is only a hint (it may be a remark such as "(Lactose) free"): exact or
        // synonym hits are offered, always labelled, and never beat a match on the name itself.
        if (e.cNoSyn === cNoSyn || e.c === c) add(matches, e.p, 'name in brackets (check)', 85)
        continue
      }
      if (e.cNoSyn === cNoSyn) add(matches, e.p, e.other ? 'other name' : 'name', 95)
      else if (e.c === c) add(matches, e.p, 'synonym (check)', 88)
      else if (closeSpelling(c, e.c)) add(matches, e.p, 'close spelling (check)', 82)
      else if (namedWithin(c, e.c)) add(matches, e.p, 'name inside a longer name (check)', 70)
      else {
        const b = e.nums ? bases.nums : bases.plain
        if (b && e.base === b && distinctive(b)) add(matches, e.p, 'same molecule, other salt or form (check)', 60)
      }
    }
  }
  // Keep the best kind of match: if the product itself is found, drop weaker guesses.
  // An exact name or CAS match also drops spelling guesses ("Sucralose" must not bring "Sucrose").
  const all = [...matches.values()].sort((a, z) => z.score - a.score)
  const best = all[0]?.score ?? 0
  return all.filter((m) => (best >= 95 ? m.score >= 88 : best >= 80 ? m.score >= 80 : true))
}

// Scan free text (letters, PDFs) for any known product name or CAS number.
export function scanText(text: string, idx: ProductIndex): OrderLine[] {
  const norm = ` ${normName(text)} `
  const found = new Map<string, OrderLine>()
  for (const c of findCas(text)) {
    const ps = idx.byCas.get(c) || []
    found.set(`cas:${c}`, {
      requested: ps[0]?.name ? `${ps[0].name} (CAS ${c})` : `CAS ${c}`,
      cas: c,
      matches: ps.map((p) => ({ productId: p.id, productName: p.name, how: 'CAS number' as const, score: 100 })),
    })
  }
  for (const e of idx.list) {
    const n = normName(e.c)
    if (!distinctive(n) || !norm.includes(` ${n} `)) continue
    if ([...found.values()].some((l) => l.matches.some((m) => m.productId === e.p.id))) continue
    const key = `name:${normName(e.p.name)}`
    const line = found.get(key) || { requested: e.p.name, matches: [] }
    line.matches.push({ productId: e.p.id, productName: e.p.name, how: 'name inside a longer name (check)', score: 70 })
    found.set(key, line)
  }
  return [...found.values()]
}

export function matchOrder(rows: OrderRow[], fullText: string, products: CatalogueProduct[], opts: { scanFreeText?: boolean } = {}): OrderLine[] {
  const idx = buildIndex(products)
  // Lines from letters, Word or PDF files are kept only when they look like an order line: a match,
  // a CAS number or a quantity. Greetings and addresses are dropped. Table rows are always kept.
  const QTY = /\b\d+(?:[.,]\d+)?\s*(?:kg|kgs|g|mg|mt|t|ton|tons|tonnes|l|litre|liter|drums?|bags?)\b/i
  const lines: OrderLine[] = rows
    .map((r) => ({
      requested: r.text.replace(/^[-*•\s\d.)]+(?=[A-Za-z])/, '').trim(),
      cas: r.cas,
      grade: r.grade,
      quantity: r.quantity,
      row: r.row,
      matches: matchRow(r, idx),
      fromText: r.fromText,
    }))
    .filter((l) => !l.fromText || l.matches.length || findCas(l.requested).length || QTY.test(l.requested))
    .map((l) => {
      delete l.fromText
      return l
    })
  const scan = opts.scanFreeText ?? rows.every((r) => r.fromText)
  if (!scan) return lines
  // Materials mentioned in running text (a sentence in a letter) but not on a line already handled
  // as an order row: those lines were judged by the row matcher and are not scanned again.
  const clean = (t: string) => t.replace(/\s+/g, ' ').trim().replace(/^[-*\u2022\s\d.)]+(?=[A-Za-z])/, '').trim()
  const kept = new Set(lines.map((l) => l.requested))
  const rest = fullText
    .split(/\r?\n/)
    .filter((l) => !kept.has(clean(l)))
    .join('\n')
  const seen = new Set(lines.flatMap((l) => l.matches.map((m) => m.productId)))
  for (const l of scanText(rest, idx)) {
    const fresh = l.matches.filter((m) => !seen.has(m.productId))
    if (fresh.length || (l.cas && !l.matches.length && !lines.some((x) => x.cas === l.cas || x.requested.includes(l.cas!)))) {
      lines.push({ ...l, matches: fresh })
      fresh.forEach((m) => seen.add(m.productId))
    }
  }
  return lines
}
