import assert from 'node:assert/strict'
import { test } from 'node:test'

import { PDFDocument } from 'pdf-lib'

import {
  amountInWords, type BuyerDoc, buyerDocGaps, buyerDocSpec, buyerTotal, docNumber, emailsIn, goodsTotal, nextSeq, parseQuantity, supplierMessage,
  safeFileName, type SupplierOrderDoc, supplierOrderGaps, supplierOrderSpec,
} from '../src/lib/trade-docs.ts'
import { latin, renderPdf } from '../src/lib/trade-pdf.ts'

const seller = { companyName: 'Test Trading Co., Ltd', address: 'Nanjing, China', email: 'sale@example.com', bankDetails: '' }
const rfq: SupplierOrderDoc = {
  kind: 'rfq', number: 'NJMC-RFQ-2026-0001', date: '2026-10-02', supplierName: 'Maker Pharma', contactPerson: 'Ms Li, Sales Manager', supplierSource: 'CPHI Shenzhen 2026',
  items: [{ material: 'Carbomer 940', spec: 'BP', quantity: 200, unit: 'kg' }, { material: 'Zinc oxide', quantity: 1050.5 }],
}

test('document numbers run per prefix and year', () => {
  assert.equal(docNumber('PO', 2026, 7), 'NJMC-PO-2026-0007')
  assert.equal(nextSeq(['NJMC-RFQ-2026-0002', 'NJMC-RFQ-2026-0009', 'NJMC-PO-2026-0030', 'NJMC-RFQ-2025-0100', null], 'RFQ', 2026), 10)
  assert.equal(nextSeq([], 'PI', 2026), 1)
})

test('email addresses are taken out of free text', () => {
  assert.deepEqual(emailsIn('commercial@example.cn; Service@example.cn (business card), commercial@example.cn.'), ['commercial@example.cn', 'service@example.cn'])
  assert.deepEqual(emailsIn('no email, WeChat only'), [])
})

test('quantities: number and unit, or nothing when it is not a plain number', () => {
  assert.deepEqual(parseQuantity('1,050 kg'), { quantity: 1050, unit: 'kg' })
  assert.deepEqual(parseQuantity('0.25'), { quantity: 0.25, unit: '' })
  assert.deepEqual(parseQuantity('600000 pcs'), { quantity: 600000, unit: 'pcs' })
  assert.deepEqual(parseQuantity('2 x 25 kg'), { quantity: null, unit: '' })
})

test('totals and the amount in words', () => {
  assert.equal(goodsTotal([{ quantity: 3, unitPrice: 1.25 }, { quantity: 0.5, unitPrice: 0.33 }, { quantity: 2, unitPrice: null }]), 3.92)
  assert.equal(amountInWords(111173.5), 'SAY US DOLLARS ONE HUNDRED AND ELEVEN THOUSAND ONE HUNDRED AND SEVENTY THREE AND CENTS FIFTY ONLY')
  assert.equal(amountInWords(1000000, 'EUR'), 'SAY EUROS ONE MILLION ONLY')
  assert.equal(amountInWords(0.07), 'SAY US DOLLARS ZERO AND CENTS SEVEN ONLY')
})

test('the enquiry message lists the materials, never a price or a customer', () => {
  const m = supplierMessage(rfq, seller)
  assert.match(m.subject, /^Enquiry NJMC-RFQ-2026-0001: 2 items/)
  assert.match(m.body, /^Dear Ms Li,/)
  assert.match(m.body, /1\. Carbomer 940, 200 kg, BP\n2\. Zinc oxide, 1,050\.5 kg/)
  assert.match(m.body, /product list from CPHI/)
  assert.doesNotMatch(supplierMessage({ ...rfq, supplierSource: 'past order', contactPerson: '' }, seller).body, /CPHI/)
  assert.match(supplierMessage({ ...rfq, contactPerson: '' }, seller).body, /^Dear Sir or Madam,/)
})

test('the purchase order message carries the value and the terms', () => {
  const po: SupplierOrderDoc = { ...rfq, kind: 'po', number: 'NJMC-PO-2026-0001', currency: 'USD', incoterm: 'FOB', incotermPlace: 'Shanghai', paymentTerms: '30% in advance',
    items: [{ material: 'Carbomer 940', quantity: 200, unit: 'kg', unitPrice: 12.5 }] }
  const m = supplierMessage(po, seller)
  assert.match(m.body, /Order value: USD 2,500\.00, FOB Shanghai\./)
  const spec = supplierOrderSpec(po, seller)
  assert.equal(spec.title, 'PURCHASE ORDER')
  assert.deepEqual(spec.totals[0], ['Total (USD)', '2,500.00'])
  assert.deepEqual(supplierOrderGaps(po, ['a@example.cn']), [])
  assert.deepEqual(supplierOrderGaps({ ...po, paymentTerms: '', items: [{ material: 'X', quantity: 1 }] }, []).length, 3)
  assert.equal(supplierOrderSpec(rfq, seller).totals.length, 0)
})

const buyer: BuyerDoc = {
  piNumber: 'NJMC-PI-2026-0001', piDate: '2026-10-02', invoiceNumber: 'NJMC-INV-2026-0001', invoiceDate: '2026-11-01', buyerName: 'Buyer Pharma', buyerAddress: 'Aden', currency: 'USD', incoterm: 'CIF',
  incotermPlace: 'Aden', paymentTerms: '100% T/T in advance', freight: 100, discount: 10,
  items: [{ description: 'Carbomer 940', quantity: 200, unit: 'kg', unitPrice: 15, packages: 8, packageType: '25 kg drums', netWeight: 200, grossWeight: 216 }],
}

test('buyer documents: one record, three documents', () => {
  assert.equal(buyerTotal(buyer), 3090)
  const pi = buyerDocSpec(buyer, seller, 'pi')
  assert.equal(pi.title, 'PROFORMA INVOICE')
  assert.equal(pi.right[0][1], 'NJMC-PI-2026-0001')
  assert.deepEqual(pi.totals.slice(0, 4), [['Goods (USD)', '3,000.00'], ['Freight', '100.00'], ['Discount', '-10.00'], ['Total CIF Aden (USD)', '3,090.00']])
  const inv = buyerDocSpec(buyer, seller, 'invoice')
  assert.equal(inv.right[0][1], 'NJMC-INV-2026-0001')
  assert.equal(inv.right[1][1], '2026-11-01')
  const pl = buyerDocSpec(buyer, seller, 'packing-list')
  assert.deepEqual(pl.totals, [['Total packages', '8'], ['Total net weight (kg)', '200'], ['Total gross weight (kg)', '216']])
  assert.ok(pl.rows[0].every((c) => !c.includes('15.00')), 'no prices on the packing list')
  assert.deepEqual(buyerDocGaps(buyer, seller, 'pi'), ['bank details are empty (Company details for documents)'])
  assert.deepEqual(buyerDocGaps(buyer, seller, 'packing-list'), [])
  assert.equal(buyerDocGaps({ ...buyer, invoiceDate: '', buyerName: String.fromCodePoint(0x5361, 0x6ce2) }, seller, 'invoice').length, 3)
  assert.equal(supplierOrderGaps({ ...rfq, items: [{ material: 'X', quantity: 1, unitPrice: 0 }], kind: 'po', paymentTerms: 'T/T' }, ['a@example.cn'])[0], 'a price is missing')
  assert.equal(safeFileName('Proforma "x"/' + String.fromCodePoint(0x5361) + '.pdf'), 'Proforma x .pdf')
})

test('PDF: Latin text only, real PDF bytes, long lists run onto more pages', async () => {
  const cjk = String.fromCodePoint(0x5361, 0x6ce2)
  assert.equal(latin(`Carbomer ${cjk} ${String.fromCodePoint(0x2013)} 940 (${cjk})`), 'Carbomer - 940 ')
  const many = { ...rfq, items: Array.from({ length: 90 }, (_, i) => ({ material: `Material ${i}`, quantity: i, unit: 'kg' })) }
  const pdf = await renderPdf(supplierOrderSpec(many, seller))
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), '%PDF-')
  assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 2)
  for (const type of ['pi', 'invoice', 'packing-list'] as const) assert.ok((await renderPdf(buyerDocSpec(buyer, seller, type))).length > 1000)
})
