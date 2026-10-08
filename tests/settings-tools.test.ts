import assert from 'node:assert/strict'
import { test } from 'node:test'

import { ratesFromFrankfurter } from '../src/lib/rates.ts'
import { keyHint, open, seal } from '../src/lib/secret-box.ts'

test('the API key is stored encrypted and only the server secret opens it', () => {
  const sealed = seal('sk-ant-test-0123456789abcd', 'secret-one')
  assert.doesNotMatch(sealed, /sk-ant/)
  assert.equal(open(sealed, 'secret-one'), 'sk-ant-test-0123456789abcd')
  assert.equal(open(sealed, 'secret-two'), null)
  assert.equal(open('garbage', 'secret-one'), null)
  assert.notEqual(seal('same', 's'), seal('same', 's'))
  assert.equal(keyHint('sk-ant-api03-0123456789wxyz'), 'sk-ant-...wxyz')
})

test('exchange rates from the ECB feed', () => {
  assert.deepEqual(ratesFromFrankfurter({ amount: 1, base: 'USD', date: '2026-10-07', rates: { CNY: 6.7046, EUR: 0.89469 } }), {
    cnyPerUsd: 6.7046, usdPerEur: 1.1177, date: '2026-10-07', source: 'European Central Bank (frankfurter.dev)',
  })
  assert.equal(ratesFromFrankfurter({ base: 'EUR', rates: { CNY: 7 } }), null)
  assert.equal(ratesFromFrankfurter(null), null)
})
