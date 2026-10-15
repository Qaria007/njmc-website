import assert from 'node:assert/strict'
import { test } from 'node:test'

import { countryName, networkName, sessionStats, visitorCode } from '../src/lib/visits.ts'

test('visitor code: one way, fixed length, changes with the day and the secret', () => {
  const a = visitorCode('203.0.113.9', 'Mozilla/5.0', '2026-10-15', 's1')
  assert.equal(a.length, 24)
  assert.equal(a, visitorCode('203.0.113.9', 'Mozilla/5.0', '2026-10-15', 's1'))
  assert.notEqual(a, visitorCode('203.0.113.9', 'Mozilla/5.0', '2026-10-16', 's1'))
  assert.notEqual(a, visitorCode('203.0.113.9', 'Mozilla/5.0', '2026-10-15', 's2'))
  assert.ok(!a.includes('203.0.113.9'))
})

test('country names and network names', () => {
  assert.equal(countryName('SA'), 'Saudi Arabia')
  assert.equal(countryName('CN'), 'China')
  assert.equal(countryName('xx'), '')
  assert.equal(networkName('ppp-12-34.dynamic.chello.nl'), 'chello.nl')
  assert.equal(networkName('mail.aramco.com.sa'), 'aramco.com.sa')
  assert.equal(networkName('host-1.example.co.uk.'), 'example.co.uk')
  assert.equal(networkName('localhost'), '')
  assert.equal(networkName(''), '')
})

test('session statistics', () => {
  const row = (o: Partial<Parameters<typeof sessionStats>[0][number]>) => ({
    day: '2026-10-15', startedAt: '', country: 'China', city: 'Nanjing', network: 'chinanet.cn', source: 'google.com', device: 'computer', lang: 'en', landing: '/', pageCount: 1, contactClicks: 0, ...o,
  })
  const s = sessionStats([row({}), row({ pageCount: 4, contactClicks: 1, country: 'Saudi Arabia', city: 'Riyadh', network: 'stc.com.sa' }), row({ day: '2026-10-14', pageCount: 2, landing: '/catalogue/' })], ['2026-10-14', '2026-10-15'])
  assert.equal(s.visitors, 3)
  assert.equal(s.pagesPerVisit, 2.3)
  assert.equal(s.oneAndGone, 33)
  assert.equal(s.withContact, 1)
  assert.deepEqual(s.countries[0], { name: 'China', count: 2 })
  assert.deepEqual(s.cities[1], { name: 'Riyadh, Saudi Arabia', count: 1 })
  assert.deepEqual(s.perDay, [{ day: '2026-10-14', visitors: 1 }, { day: '2026-10-15', visitors: 2 }])
})
