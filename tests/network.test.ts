import assert from 'node:assert/strict'
import { test } from 'node:test'

import { BONUS_PER_SHARE, emptyStats, mergeStats, monthlyLimit, PLANS, productKey, rankSuppliers, sha256, standingOf, statsFromSignals, usageText } from '../src/lib/network.ts'

const st = (o: Partial<ReturnType<typeof emptyStats>>) => ({ ...emptyStats(), ...o })

test('standing: golden is earned by fast answers and a delivered order, silent by three unanswered enquiries, flagged by a problem', () => {
  assert.equal(standingOf(st({})), 'new')
  assert.equal(standingOf(st({ enquiries: 2, answered: 1, avgReplyDays: 5 })), 'normal')
  assert.equal(standingOf(st({ enquiries: 4, answered: 3, avgReplyDays: 2, orders: 1 })), 'golden')
  assert.equal(standingOf(st({ enquiries: 4, answered: 3, avgReplyDays: 6, orders: 1 })), 'normal', 'slow answers are not golden')
  assert.equal(standingOf(st({ enquiries: 4, answered: 3, avgReplyDays: 1, orders: 0 })), 'normal', 'no order yet is not golden')
  assert.equal(standingOf(st({ enquiries: 3 })), 'silent')
  assert.equal(standingOf(st({ enquiries: 2 })), 'normal', 'two unanswered enquiries are not silent yet')
  assert.equal(standingOf(st({ enquiries: 9, answered: 9, avgReplyDays: 1, orders: 5, problems: 1 })), 'flagged', 'a problem beats everything')
})

test('ranking: golden first, silent and flagged last, then answer rate, rating, e-mail, name', () => {
  const list = [
    { id: 'z', name: 'Zeta', rating: '3', email: 'z@x', stats: st({ enquiries: 2, answered: 1, avgReplyDays: 4 }) },
    { id: 'f', name: 'Flagged', rating: '5', email: 'f@x', stats: st({ enquiries: 5, answered: 5, avgReplyDays: 1, orders: 3, problems: 1 }) },
    { id: 'g', name: 'Golden', rating: null, email: null, stats: st({ enquiries: 3, answered: 3, avgReplyDays: 1, orders: 1 }) },
    { id: 's', name: 'Silent', rating: '5', email: 's@x', stats: st({ enquiries: 3 }) },
    { id: 'a', name: 'Alpha', rating: '3', email: null, stats: st({ enquiries: 2, answered: 1, avgReplyDays: 4 }) },
    { id: 'b', name: 'Beta', rating: '4', email: null, stats: st({ enquiries: 2, answered: 1, avgReplyDays: 4 }) },
    { id: 'n', name: 'Newcomer', rating: null, email: 'n@x', stats: st({}) },
  ]
  assert.deepEqual(rankSuppliers(list).map((x) => x.id), ['g', 'b', 'z', 'a', 'n', 's', 'f'])
})

test('signals fold into stats; own and network stats merge with a weighted reply time', () => {
  const m = statsFromSignals([
    { supplierId: '1', event: 'enquiry_sent' }, { supplierId: '1', event: 'enquiry_sent' }, { supplierId: '1', event: 'replied', days: 2 },
    { supplierId: '1', event: 'ordered' }, { supplierId: '2', event: 'enquiry_sent' }, { supplierId: '2', event: 'problem' }, { supplierId: '3', event: 'shared' },
  ])
  assert.deepEqual(m.get('1'), { enquiries: 2, answered: 1, avgReplyDays: 2, orders: 1, problems: 0 })
  assert.deepEqual(m.get('2'), { enquiries: 1, answered: 0, avgReplyDays: null, orders: 0, problems: 1 })
  assert.equal(m.has('3'), false, 'a share is not a dealing')
  const merged = mergeStats(st({ enquiries: 1, answered: 1, avgReplyDays: 6 }), m.get('1')!)
  assert.deepEqual(merged, { enquiries: 3, answered: 2, avgReplyDays: 4, orders: 1, problems: 0 })
  assert.deepEqual(mergeStats(st({ enquiries: 1 }), st({ enquiries: 2, answered: 1, avgReplyDays: 3 })), { enquiries: 3, answered: 1, avgReplyDays: 3, orders: 0, problems: 0 })
})

test('plans and the monthly allowance: starter 3 per product and 20 a month, business 5 and 60, plus 2 per shared supplier', () => {
  assert.equal(PLANS.trial.perProduct, 3)
  assert.equal(PLANS.trial.perMonth, 3)
  assert.equal(PLANS.starter.perProduct, 3)
  assert.equal(PLANS.starter.perMonth, 20)
  assert.equal(PLANS.business.perProduct, 5)
  assert.equal(PLANS.business.perMonth, 60)
  assert.equal(BONUS_PER_SHARE, 2)
  assert.equal(monthlyLimit('starter', 0), 20)
  assert.equal(monthlyLimit('starter', 3), 26)
  assert.equal(monthlyLimit('business', -1), 60)
})

test('keys and wording', () => {
  assert.equal(productKey(42), 'p:42')
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  assert.equal(usageText({ plan: 'business', perProduct: 5, used: 7, limit: 62, month: '2026-10', shares: 1 }), 'Supplier network (Business): 7 of 62 product searches used in 2026-10, up to 5 suppliers per product.')
})
