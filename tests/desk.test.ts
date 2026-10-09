import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildTasks, clientReminder, type EnquiryRow, namesMaterial, priceHistory, type SaleRow, supplierReminder, supplierScores } from '../src/lib/desk.ts'
import { keyModelMismatch, providerOf } from '../src/lib/ai.ts'

const rates = { cnyPerUsd: 7.2, usdPerEur: 1.1 }
const now = '2026-10-09T10:00:00.000Z'
const rfq = (o: Partial<EnquiryRow>): EnquiryRow => ({
  id: '1', number: 'RFQ-1', kind: 'rfq', status: 'sent', supplierId: '10', supplier: 'Maker A', orderId: 'o1', orderTitle: 'Order 1', date: '2026-10-01', sentAt: '', quoteReceivedAt: '',
  quoteValidUntil: '', currency: 'USD', fromEnquiry: null, items: [], ...o,
})
const sale = (o: Partial<SaleRow>): SaleRow => ({
  id: 's1', number: 'PI-1', invoiceNumber: '', client: 'Client Co', status: 'draft', piDate: '2026-10-02', validity: '', eta: '', etd: '', readyDate: '', orderId: null, currency: 'USD',
  outstandingUsd: null, committed: false, items: [], ...o,
})

test('the to-do list: late replies, prices to use, PIs waiting, payments, shipments, expiring prices', () => {
  const t = buildTasks(
    {
      enquiries: [
        rfq({ id: '1', sentAt: '2026-10-01T00:00:00Z' }),
        rfq({ id: '2', sentAt: '2026-10-08T00:00:00Z' }),
        rfq({ id: '3', supplier: 'Maker B', sentAt: '2026-10-01T00:00:00Z', quoteReceivedAt: '2026-10-03T00:00:00Z', quoteValidUntil: '2026-10-12T12:00:00Z' }),
        rfq({ id: '4', orderId: 'o2', sentAt: '2026-10-01T00:00:00Z', quoteReceivedAt: '2026-10-03T00:00:00Z' }),
      ],
      sales: [
        sale({ id: 's1', status: 'PI sent', validity: '2026-10-20' }),
        sale({ id: 's2', status: 'confirmed', committed: true, outstandingUsd: 500, eta: '2026-10-15' }),
        sale({ id: 's3', status: 'draft', orderId: 'o2' }),
      ],
      certs: [{ supplierId: '10', supplier: 'Maker A', type: 'EU GMP', validUntil: '2026-11-01' }, { supplierId: '10', supplier: 'Maker A', type: 'ISO', validUntil: '2028-01-01' }],
      orders: [{ id: 'o3', title: 'New one', status: 'new', client: '', createdAt: '2026-10-08T00:00:00Z' }],
      poOwed: [{ id: 'p1', number: 'PO-1', supplier: 'Maker A', owedUsd: 100, date: '2026-10-05' }],
    },
    now,
  )
  assert.deepEqual(t.overdueReplies.map((x) => [x.action?.id, x.age]), [['1', 8]])
  assert.deepEqual(t.pricesToUse.map((x) => x.title), ['Prices from Maker B (RFQ-1)'])
  assert.equal(t.waitingClient.length, 1)
  assert.equal(t.paymentsDue[0].title, 'Client Co owes USD 500.00')
  assert.equal(t.supplierPayments.length, 1)
  assert.equal(t.shipments[0].due, '2026-10-15')
  assert.equal(t.expiringQuotes[0].title, 'Maker B prices expire 2026-10-12')
  assert.equal(t.certificates.length, 1)
  assert.equal(t.newOrders.length, 1)
})

test('price history: quoted, bought and sold, newest first, in USD', () => {
  assert.ok(namesMaterial('Mesalamine EP', 'mesalamine'))
  assert.ok(namesMaterial('Mesalazine (Mesalamine) USP', 'mesalamine usp'))
  assert.ok(!namesMaterial('Talc', 'mesalamine'))
  const pts = priceHistory(
    'mesalamine',
    [
      rfq({ items: [{ material: 'Mesalamine EP', quotedPrice: 360 }], currency: 'CNY', quoteReceivedAt: '2026-09-01T00:00:00Z' }),
      rfq({ id: '9', kind: 'po', number: 'PO-9', date: '2026-09-10', items: [{ material: 'Mesalamine EP', unitPrice: 48 }] }),
    ],
    [sale({ status: 'paid', piDate: '2026-09-12', items: [{ description: 'Mesalamine EP', unitPrice: 55 }] }), sale({ status: 'draft', items: [{ description: 'Mesalamine EP', unitPrice: 1 }] })],
    rates,
  )
  assert.deepEqual(pts.map((p) => [p.kind, p.usd]), [['sold', 55], ['bought', 48], ['quoted', 50]])
})

test('supplier scorecard', () => {
  const sc = supplierScores(
    [
      rfq({ id: '1', supplierId: 'a', sentAt: '2026-10-01T00:00:00Z', quoteReceivedAt: '2026-10-03T00:00:00Z', items: [{ material: 'X', requested: 'X', quotedPrice: 10 }] }),
      rfq({ id: '2', supplierId: 'b', sentAt: '2026-10-01T00:00:00Z', quoteReceivedAt: '2026-10-02T00:00:00Z', items: [{ material: 'X', requested: 'X', quotedPrice: 12 }] }),
      rfq({ id: '3', supplierId: 'a', sentAt: '2026-10-01T00:00:00Z' }),
      rfq({ id: '4', supplierId: 'a', kind: 'po' }),
    ],
    [{ supplierId: 'a', supplier: 'A', type: 'GMP', validUntil: '2026-01-01' }],
    rates,
    now,
  )
  const a = sc.get('a')!
  assert.deepEqual([a.enquiries, a.answered, a.answerRate, a.avgReplyDays, a.cheapestRate, a.orders, a.certificates.expired], [2, 1, 50, 2, 100, 1, 1])
  assert.equal(sc.get('b')!.cheapestRate, 0)
})

test('reminders and AI provider checks', () => {
  const seller = { companyName: 'Test Co', email: 'sale@example.com' }
  assert.match(supplierReminder({ number: 'RFQ-1', sentAt: '2026-10-01T00:00:00Z', quoteLink: 'https://x/quote/k' }, seller).body, /on 2026-10-01[\s\S]*https:\/\/x\/quote\/k/)
  assert.match(clientReminder({ number: 'INV-1', outstanding: '500.00', currency: 'USD', paid: true }, seller).body, /USD 500.00 is still open on INV-1/)
  assert.equal(providerOf('gpt-5'), 'openai')
  assert.equal(providerOf('claude-opus-5-5'), 'anthropic')
  assert.match(keyModelMismatch('sk-ant-x', 'gpt-5') ?? '', /Claude/)
  assert.equal(keyModelMismatch('sk-proj-x', 'gpt-5'), null)
  assert.match(keyModelMismatch('sk-proj-x', 'claude-opus-5-5') ?? '', /OpenAI/)
})
