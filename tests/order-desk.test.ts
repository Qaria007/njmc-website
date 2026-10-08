import assert from 'node:assert/strict'
import { test } from 'node:test'

import ExcelJS from 'exceljs'

import { accountsOverview, cleanQuote, clientMessage, compareQuotes, convert, type QuotedEnquiry, saleMargin, sellPrice, toUsd } from '../src/lib/order-desk.ts'
import { docSpecXlsx, overviewXlsx } from '../src/lib/order-desk-xlsx.ts'
import { type BuyerDoc, buyerDocSpec, supplierMessage, supplierOrderSpec } from '../src/lib/trade-docs.ts'

const rates = { cnyPerUsd: 7.2, usdPerEur: 1.1 }
const seller = { companyName: 'Test Trading Co., Ltd', email: 'sale@example.com', bankDetails: 'Bank X, account 1' }

test('currency conversion uses the typed rates and refuses to guess', () => {
  assert.equal(convert(72, 'CNY', 'USD', rates), 10)
  assert.equal(convert(10, 'EUR', 'USD', rates), 11)
  assert.equal(convert(11, 'USD', 'EUR', rates), 10)
  assert.equal(convert(5, 'USD', 'USD', {}), 5)
  assert.equal(convert(72, 'CNY', 'USD', {}), null)
  assert.equal(toUsd({ amount: 720, currency: 'CNY' }, rates), 100)
  assert.equal(toUsd({ amount: 720, currency: 'CNY', usdRate: 0.15 }, rates), 108)
  assert.equal(toUsd({ amount: 720, currency: 'CNY' }, {}), null)
})

test('selling price is cost plus margin, in cents', () => {
  assert.equal(sellPrice(10, 15), 11.5)
  assert.equal(sellPrice(3.333, 10), 3.67)
  assert.equal(sellPrice(8, 0), 8)
})

const enquiries: QuotedEnquiry[] = [
  {
    id: 1, number: 'NJMC-RFQ-2026-0001', supplierId: '10', supplier: 'Maker A', status: 'supplier replied', currency: 'CNY', incoterm: 'EXW', quoteValidUntil: '2026-12-31',
    items: [
      { id: 'a1', material: 'Mesalazine', requested: 'Mesalamine EP', quantity: 500, unit: 'kg', quotedPrice: 360 },
      { id: 'a2', material: 'Zinc oxide', requested: 'Zinc oxide USP', quantity: 100, unit: 'kg', quotedPrice: null },
    ],
  },
  {
    id: 2, number: 'NJMC-RFQ-2026-0002', supplierId: '11', supplier: 'Maker B', status: 'supplier replied', currency: 'USD', incoterm: 'FOB', incotermPlace: 'Shanghai', quoteValidUntil: '2026-01-01',
    items: [{ id: 'b1', material: 'Mesalamine EP', quantity: 500, unit: 'kg', quotedPrice: 48 }, { id: 'b2', material: 'Talc', quantity: 20, unit: 'kg', quotedPrice: 2 }],
  },
  { id: 3, number: 'NJMC-RFQ-2026-0003', supplierId: '12', supplier: 'Maker C', status: 'cancelled', currency: 'USD', items: [{ id: 'c1', material: 'Mesalamine EP', quotedPrice: 1 }] },
]

test('quotations are grouped per order line, cheapest first, expired and unpriced marked', () => {
  const lines = compareQuotes([{ requested: 'Mesalamine EP', quantity: '500 kg' }, { requested: 'Zinc oxide USP', quantity: '100 kg' }], enquiries, 'USD', rates, '2026-10-08')
  assert.equal(lines.length, 3)
  assert.deepEqual(lines[0].options.map((o) => [o.supplier, o.converted, o.expired]), [['Maker B', 48, true], ['Maker A', 50, false]])
  assert.equal(lines[1].options.length, 0)
  assert.equal(lines[2].requested, 'Talc')
  // Without the CNY rate the CNY price stays, unconverted, after the USD one.
  const noRate = compareQuotes([{ requested: 'Mesalamine EP' }], enquiries, 'USD', {}, '2026-10-08')
  assert.deepEqual(noRate[0].options.map((o) => o.converted), [48, null])
})

test('the quotation form accepts clean numbers only', () => {
  const ok = cleanQuote({ currency: 'usd', incoterm: 'fob', validUntil: '2026-11-30', items: [{ id: 'a1', price: '1,250.5', moq: '25 kg' }, { id: 'zz', price: '9' }] }, ['a1', 'a2'], ['USD', 'CNY'], ['FOB'])
  assert.ok(!('error' in ok))
  if (!('error' in ok)) {
    assert.equal(ok.currency, 'USD')
    assert.deepEqual(ok.items.map((i) => i.price), [1250.5, null])
    assert.equal(ok.items[0].moq, '25 kg')
  }
  assert.deepEqual(cleanQuote({ currency: 'GBP', items: [{ id: 'a1', price: '1' }] }, ['a1'], ['USD'], []), { error: 'Choose the currency' })
  assert.deepEqual(cleanQuote({ currency: 'USD', items: [{ id: 'a1', price: '' }] }, ['a1'], ['USD'], []), { error: 'Enter a price for at least one item' })
  assert.deepEqual(cleanQuote({ currency: 'USD', items: [{ id: 'a1', price: '12 dollars' }, { id: 'a2', price: '3' }] }, ['a1', 'a2'], ['USD'], []), { error: 'A price is not a number' })
  assert.deepEqual(cleanQuote({ currency: 'USD', items: [{ id: 'a1', price: '12,5' }] }, ['a1'], ['USD'], []), { error: 'Use a dot for decimals, e.g. 12.50' })
  assert.deepEqual(cleanQuote({ currency: 'USD', validUntil: 'soon', items: [{ id: 'a1', price: '1' }] }, ['a1'], ['USD'], []), { error: 'The validity date is not a date' })
})

test('the enquiry email and PDF carry the quotation link', () => {
  const d = { kind: 'rfq' as const, number: 'NJMC-RFQ-2026-0009', date: '2026-10-08', supplierName: 'Maker A', items: [{ material: 'Talc', quantity: 20 }], quoteLink: 'https://example.com/quote/abc' }
  assert.match(supplierMessage(d, seller).body, /enter your prices on this page \(no login needed\):\nhttps:\/\/example\.com\/quote\/abc/)
  assert.match(supplierOrderSpec(d, seller).sections.map((s) => s.text).join('\n'), /Enter your prices online: https:\/\/example\.com\/quote\/abc/)
  assert.doesNotMatch(supplierMessage({ ...d, quoteLink: '' }, seller).body, /quote\//)
})

const sale: BuyerDoc = {
  piNumber: 'NJMC-PI-2026-0001', piDate: '2026-10-08', buyerName: 'Client Co', buyerContact: 'Mr Ali, Purchasing', buyerReference: 'PO-77', currency: 'USD', incoterm: 'CIF', incotermPlace: 'Aden',
  paymentTerms: '100% T/T in advance', validity: '2026-10-22', items: [{ description: 'Mesalamine EP', quantity: 500, unit: 'kg', unitPrice: 55 }],
}

test('the client message and the sale margin', () => {
  const m = clientMessage(sale, seller, 'pi')
  assert.equal(m.subject, 'Proforma invoice NJMC-PI-2026-0001 (Test Trading Co., Ltd)')
  assert.match(m.body, /^Dear Mr Ali,/)
  assert.match(m.body, /Total: USD 27,500.00 CIF Aden\./)
  assert.match(m.body, /valid until 2026-10-22/)
  assert.deepEqual(saleMargin({ items: [{ quantity: 500, unitPrice: 55, costPrice: 50 }, { quantity: 10, unitPrice: 2 }] }), { sales: 27520, cost: 25000, profit: 2520, percent: 10.08, missingCost: 1 })
  assert.deepEqual(saleMargin({ items: [{ quantity: 1, unitPrice: 2 }] }), { sales: 2, cost: null, profit: null, percent: null, missingCost: 1 })
})

test('accounts: received, owed, profit per sale', () => {
  const o = accountsOverview(
    [
      { id: 's1', number: 'PI-1', invoiceNumber: 'INV-1', buyer: 'Client Co', date: '2026-10-01', status: 'paid', orderId: 'o1', total: { amount: 27500, currency: 'USD' }, estimatedCost: 25000, costSuppliers: ['10'] },
      { id: 's2', number: 'PI-2', invoiceNumber: '', buyer: 'Other', date: '2026-10-05', status: 'confirmed', orderId: null, total: { amount: 1000, currency: 'USD' }, estimatedCost: 800 },
      { id: 's4', number: 'PI-4', invoiceNumber: '', buyer: 'Maybe', date: '2026-10-06', status: 'PI sent', orderId: null, total: { amount: 5000, currency: 'USD' }, estimatedCost: 4000 },
      { id: 's3', number: 'PI-3', invoiceNumber: '', buyer: 'Gone', date: '2026-10-05', status: 'cancelled', orderId: null, total: { amount: 99, currency: 'USD' }, estimatedCost: null },
    ],
    [
      { id: 'p1', number: 'PO-1', supplier: 'Maker A', supplierId: '10', date: '2026-10-02', status: 'confirmed', orderId: 'o1', total: { amount: 172800, currency: 'CNY' } },
      { id: 'p2', number: 'PO-2', supplier: 'Maker B', date: '2026-10-02', status: 'draft', orderId: null, total: { amount: 999, currency: 'USD' } },
    ],
    [
      { id: 1, date: '2026-10-03', direction: 'in', amount: 20000, currency: 'USD', buyerDocId: 's1', party: 'Client Co' },
      { id: 2, date: '2026-10-04', direction: 'out', amount: 72000, currency: 'CNY', supplierOrderId: 'p1', party: 'Maker A' },
      { id: 3, date: '2026-10-04', direction: 'expense', category: 'freight', amount: 500, currency: 'USD', buyerDocId: 's1', party: 'Forwarder' },
      { id: 4, date: '2026-10-04', direction: 'in', amount: 999, currency: 'USD', buyerDocId: 's1', party: 'x', void: true },
    ],
    rates,
    '2026-10-01',
    '2026-10-31',
  )
  assert.deepEqual(o.totals, { received: 20000, paidSuppliers: 10000, expenses: 500, cashNet: 9500, receivable: 8500, payable: 14000, profit: 3200 })
  const s1 = o.sales.find((s) => s.id === 's1')
  assert.equal(s1?.costUsd, 24000)
  assert.equal(s1?.costIsEstimate, false)
  assert.equal(s1?.profitUsd, 3000)
  const s2 = o.sales.find((s) => s.id === 's2')
  assert.equal(s2?.costIsEstimate, true)
  assert.equal(s2?.profitUsd, 200)
  // The PI only sent (not confirmed, nothing paid) is listed but owes nothing and adds no profit yet.
  assert.equal(o.sales.find((s) => s.id === 's4')?.committed, false)
  assert.equal(o.sales.length, 3)
  assert.equal(o.purchases.length, 1)
  assert.equal(o.ledger.length, 3)
  // Two sales on one order: the order's purchase orders are not charged to both; a PO from only
  // one of the PI's suppliers does not replace the PI cost.
  const two = accountsOverview(
    [
      { id: 'x1', number: 'PI-x1', invoiceNumber: '', buyer: 'A', date: '2026-10-01', status: 'confirmed', orderId: 'o9', total: { amount: 100, currency: 'USD' }, estimatedCost: 80, costSuppliers: ['10'] },
      { id: 'x2', number: 'PI-x2', invoiceNumber: '', buyer: 'A', date: '2026-10-02', status: 'confirmed', orderId: 'o9', total: { amount: 100, currency: 'USD' }, estimatedCost: 70, costSuppliers: ['11'] },
      { id: 'y1', number: 'PI-y1', invoiceNumber: '', buyer: 'B', date: '2026-10-02', status: 'confirmed', orderId: 'o8', total: { amount: 300, currency: 'USD' }, estimatedCost: 200, costSuppliers: ['10', '11'] },
    ],
    [
      { id: 'q1', number: 'PO-q1', supplier: 'S10', supplierId: '10', date: '2026-10-01', status: 'confirmed', orderId: 'o9', total: { amount: 90, currency: 'USD' } },
      { id: 'q2', number: 'PO-q2', supplier: 'S10', supplierId: '10', date: '2026-10-01', status: 'confirmed', orderId: 'o8', total: { amount: 50, currency: 'USD' } },
    ],
    [{ id: 9, date: '2026-10-03', direction: 'expense', amount: 10, currency: 'USD', orderId: 'o9', party: 'Forwarder' }],
    rates,
  )
  assert.deepEqual(two.sales.map((s) => [s.id, s.costUsd, s.costIsEstimate, s.expensesUsd]), [['x1', 80, true, 10], ['x2', 70, true, 0], ['y1', 200, true, 0]])
  const noRate = accountsOverview([], [], [{ id: 1, date: '2026-10-03', direction: 'out', amount: 7, currency: 'CNY', party: 'x' }], {})
  assert.deepEqual(noRate.missingRates, ['CNY'])
})

test('Excel files open and hold the same numbers as the PDF', async () => {
  const buf = await docSpecXlsx(buyerDocSpec(sale, seller, 'pi'))
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as never)
  const ws = wb.worksheets[0]
  const values: unknown[] = []
  ws.eachRow((r) => r.eachCell((c) => values.push(c.value)))
  assert.ok(values.includes('PROFORMA INVOICE'))
  assert.ok(values.includes(27500))
  assert.ok(values.includes('Bank X, account 1'))
  const acc = await overviewXlsx(accountsOverview([], [], [], rates))
  await new ExcelJS.Workbook().xlsx.load(acc as never)
})
