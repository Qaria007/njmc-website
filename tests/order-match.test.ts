import assert from 'node:assert/strict'
import { test } from 'node:test'

import { type CatalogueProduct, casValid, matchOrder } from '../src/lib/order-match.ts'
import { tableToRows } from '../src/lib/order-parse.ts'

const src = (id: number) => [{ supplierId: id, supplierName: `S${id}` }]
const products: CatalogueProduct[] = [
  { id: 1, name: 'Mesalazine', otherNames: 'Mesalamine', grades: ['EP', 'USP'], sources: src(10) },
  { id: 2, name: 'Ciprofloxacin hydrochloride', sources: src(11) },
  { id: 3, name: 'Hypromellose', otherNames: 'HPMC', cas: '9004-65-3', sources: src(12) },
  { id: 4, name: 'Amikacin sulfate', sources: src(13) },
  { id: 5, name: 'Vancomycin hydrochloride', sources: [...src(10), ...src(14)] },
  { id: 6, name: 'Zinc oxide', sources: src(15) },
  { id: 7, name: 'Magnesium stearate', sources: src(16) },
  { id: 8, name: 'Polysorbate 80', sources: src(17) },
  { id: 9, name: 'FD&C Yellow 5', otherNames: 'Tartrazine', sources: src(18) },
  { id: 10, name: 'Purified water', otherNames: 'Water', sources: src(19) },
  { id: 11, name: 'Maize starch', otherNames: 'Starch', sources: src(20) },
  { id: 12, name: 'Methylcellulose', sources: src(21) },
]

test('CAS check digit', () => {
  assert.equal(casValid('9004-65-3'), true)
  assert.equal(casValid('9004-65-4'), false)
})

test('rows match by name, other name, synonym spelling and CAS', () => {
  const rows = [
    { text: 'Mesalamine EP 500 kg' },
    { text: 'Ciprofloxacin HCl USP' },
    { text: 'HPMC E5', cas: '9004-65-3' },
    { text: 'Amikacin Sulphate' },
  ]
  const lines = matchOrder(rows, '', products)
  assert.deepEqual(lines.map((l) => l.matches.map((m) => m.productId)), [[1], [2], [3], [4]])
  assert.equal(lines[2].matches[0].how, 'CAS number')
})

test('a different salt of the same molecule is offered, not hidden', () => {
  const [line] = matchOrder([{ text: 'Ciprofloxacin lactate' }], '', products)
  assert.equal(line.matches[0].productId, 2)
  assert.equal(line.matches[0].how, 'same molecule, other salt or form (check)')
})

test('unknown materials stay on the list with no supplier', () => {
  const [line] = matchOrder([{ text: 'Unobtainium citrate' }], '', products)
  assert.equal(line.matches.length, 0)
})

test('free text (letter, PDF) is scanned for known products', () => {
  const lines = matchOrder([], 'Dear NJMC, please quote Vancomycin HCl 20 kg and mesalazine.', products)
  assert.deepEqual(lines.map((l) => l.matches[0].productId).sort(), [1, 5])
})

test('Excel header row is recognised', () => {
  const rows = tableToRows([
    ['Customer order', '', ''],
    ['No.', 'Product name', 'CAS No.', 'Grade', 'Quantity (kg)'],
    ['1', 'Mesalazine', '89-57-6', 'EP', '500'],
    ['2', '', '', '', ''],
  ])
  assert.equal(rows.length, 1)
  assert.deepEqual({ ...rows[0] }, { text: 'Mesalazine', cas: '89-57-6', grade: 'EP', quantity: '500', row: 3, aliases: [] })
})

test('different substances are not matched (review findings)', () => {
  for (const text of ['Magnesium oxide', 'Calcium stearate', 'Polysorbate 20', 'FD&C Yellow No. 6', 'Sodium starch glycolate', 'Vitamin E', 'Cetomacrogol 1000 (Polyethylene glycol cetyl ether)']) {
    const [line] = matchOrder([{ text }], '', products)
    assert.deepEqual(line.matches.filter((m) => m.score >= 80), [], text)
    assert.ok(!line.matches.some((m) => [6, 7, 8, 9, 11, 12].includes(Number(m.productId)) && !m.how.includes('check')), text)
  }
  assert.deepEqual(matchOrder([], 'Delivered to Water Street, Talcott', products), [])
})

test('an order form with "Name:" and "Date:" lines above the table', () => {
  const rows = tableToRows([
    ['Name:', 'ACME Pharma Ltd'],
    ['Date:', '2026-09-30'],
    ['No.', 'Product name', 'Grade', 'Quantity'],
    ['1', 'Mesalazine', 'EP', '500 kg'],
    ['2', 'Unobtainium citrate', 'BP', '10 kg'],
  ])
  assert.deepEqual(rows.map((r) => r.text), ['Mesalazine', 'Unobtainium citrate'])
})

test('real-order cases: bracketed headers, bracket aliases, typos, synonyms', () => {
  const extra: CatalogueProduct[] = [
    ...products,
    { id: 20, name: 'Ketoconazole', sources: src(30) },
    { id: 21, name: 'White Vaselin / 白凡士林', sources: src(31) },
    { id: 22, name: 'Carbomer 940', sources: src(32) },
    { id: 23, name: 'Kaolin / 高岭土', sources: src(33) },
    { id: 24, name: 'Vitamin A', sources: src(34) },
    { id: 25, name: '(1-Hydroxycyclohexyl)(4-methoxyphenyl)acetonitrile (VEN-1)', sources: src(35) },
    { id: 26, name: 'Polyethylene glycol', sources: src(36) },
  ]
  const rows = tableToRows([
    ['No.', '(Material Name)', '(Q.T.Y)', ' (Grade / Spec)', ' (Micronization)'],
    ['1', 'Acrypol 940', '200', 'Pharmaceutical Grade (Carbomer 940)', 'Standard'],
    ['2', 'KETOCONAZOL', '25', 'BP/USP', 'Micronized'],
    ['3', 'White petroleum jelly', '5100', 'BP/USP - White Soft Paraffin', 'Standard'],
    ['4', 'Light Kaolin L.P', '50', 'BP/L.P Grade', 'Standard'],
    ['5', 'Tartrazine Yellow Color', '1', 'Food & Drug Grade', 'Standard'],
    ['6', 'Hydroxypropyl methylcellulose', '10', 'USP', 'Standard'],
    ['7', 'Acetonitrile HPLC grade', '200', 'HPLC Grade', 'Standard'],
  ])
  assert.equal(rows.length, 7)
  assert.equal(rows[0].quantity, '200')
  const lines = matchOrder(rows, rows.map((r) => r.text).join('\n'), extra)
  assert.equal(lines.length, 7, 'table orders get no extra free-text lines')
  assert.deepEqual(lines.map((l) => l.matches.map((m) => m.productId)), [[22], [20], [21], [23], [9], [3], []])
  assert.equal(lines[1].matches[0].how, 'close spelling (check)')
  assert.equal(lines[2].matches[0].how, 'synonym (check)')
})

test('review v2: brackets and free text never give an unlabelled wrong match', () => {
  const db: CatalogueProduct[] = [
    ...products,
    { id: 40, name: 'Lactose', sources: src(40) },
    { id: 41, name: 'Titanium dioxide', sources: src(41) },
    { id: 42, name: 'Polyethylene glycol', sources: src(42) },
    { id: 43, name: 'Hydrocortisone', sources: src(43) },
  ]
  // A remark in brackets must not beat the name, and is only ever a labelled hint.
  const [a] = matchOrder([{ text: 'Magnesium stearate', aliases: ['Lactose'] }], '', db)
  assert.deepEqual(a.matches.map((m) => m.productId), [7])
  const [b] = matchOrder([{ text: 'Hard gelatin capsules (Titanium dioxide)' }], '', db)
  assert.ok(b.matches.every((m) => m.how.includes('check')))
  // Typed list: a kept row that matched nothing is not scanned again.
  const typed = ['PEG-40 hydrogenated castor oil 50 kg', 'Hydrocortisone butyrate 1 kg', 'Lactose-free excipient blend 10 kg']
  const lines = matchOrder(typed.map((text, i) => ({ text, row: i + 1, fromText: true })), typed.join('\n'), db)
  assert.equal(lines.length, 3)
  for (const l of lines) assert.ok(l.matches.every((m) => m.how.includes('check')), l.requested)
  assert.deepEqual(lines[0].matches, [])
})

test('grade words, solutions and water content do not hide a product; all are labelled (check)', () => {
  const ps: CatalogueProduct[] = [
    { id: 1, name: 'Acetonitrile', sources: src(1) },
    { id: 2, name: 'Chlorhexidine gluconate solution', sources: src(2) },
    { id: 3, name: 'Calcium chloride', sources: src(3) },
    { id: 4, name: 'Potassium chloride', sources: src(4) },
    { id: 5, name: 'Methanol anhydrous', sources: src(5) },
  ]
  const lines = matchOrder([{ text: 'Acetonitrile HPLC grade' }, { text: 'Chlorhexidine gluconate 20%' }, { text: 'Calcium Chloride Dihydrate' }, { text: 'Sodium chloride' }], '', ps)
  assert.deepEqual(lines.map((l) => l.matches.map((m) => m.productId)), [[1], [2], [3], []])
  assert.ok(lines.slice(0, 3).every((l) => l.matches[0].how.includes('(check)')))
})
