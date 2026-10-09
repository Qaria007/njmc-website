import assert from 'node:assert/strict'
import { test } from 'node:test'

import { attachmentKind, docRefIn, fromUs, isAutoReply, replyText } from '../src/lib/inbox.ts'
import { waLink, waNumber } from '../src/lib/share.ts'

test('which document an email answers', () => {
  assert.deepEqual(docRefIn('Re: Enquiry NJMC-RFQ-2026-0012: 3 items (NJMC)'), { prefix: 'RFQ', number: 'NJMC-RFQ-2026-0012' })
  assert.deepEqual(docRefIn('RE: your order', 'Regarding njmc-po-2026-0003 we confirm'), { prefix: 'PO', number: 'NJMC-PO-2026-0003' })
  assert.equal(docRefIn('Hello', 'no number here'), null)
})

test('the new part of a reply, without the quoted history', () => {
  assert.equal(replyText('Price USD 45/kg FOB.\n\nOn Mon, 6 Oct 2026 at 10:00, NJMC wrote:\n> Dear Sir'), 'Price USD 45/kg FOB.')
  assert.equal(replyText('价格 45 美元\n\n发件人: sale@njmcmedicsupp.com\n原文'), '价格 45 美元')
  assert.equal(replyText('Only text'), 'Only text')
})

test('own mail, auto-replies and attachment kinds', () => {
  assert.ok(fromUs('"NJMC" <sale@njmcmedicsupp.com>', ['sale@njmcmedicsupp.com']))
  assert.ok(!fromUs('Ms Li <li@maker.cn>', ['sale@njmcmedicsupp.com']))
  assert.ok(isAutoReply('Automatic reply: out of office', {}))
  assert.ok(isAutoReply('Re: x', { 'auto-submitted': 'auto-replied' }))
  assert.ok(!isAutoReply('Re: NJMC-RFQ-2026-0001', {}))
  assert.equal(attachmentKind('COA Mesalamine 2410.pdf'), 'coa')
  assert.equal(attachmentKind('Quotation NJMC.xlsx'), 'quotation')
  assert.equal(attachmentKind('TT copy.jpg'), 'payment')
})

test('WhatsApp links', () => {
  assert.equal(waNumber('+86 132 4453 6191 / WeChat abc'), '8613244536191')
  assert.equal(waNumber('00967-777-123-456'), '967777123456')
  assert.equal(waNumber('WeChat only'), null)
  assert.equal(waLink('+967 777 123 456', 'Hi & bye'), 'https://wa.me/967777123456?text=Hi%20%26%20bye')
  assert.equal(waLink('', 'x'), 'https://wa.me/?text=x')
})
