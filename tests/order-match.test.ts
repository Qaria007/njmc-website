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
  assert.deepEqual({ ...rows[0] }, { text: 'Mesalazine', cas: '89-57-6', grade: 'EP', quantity: '500', row: 3 })
})

test('different substances are not matched (review findings)', () => {
  for (const text of ['Magnesium oxide', 'Calcium stearate', 'Polysorbate 20', 'FD&C Yellow No. 6', 'Sodium starch glycolate', 'Hydroxypropyl methylcellulose']) {
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
