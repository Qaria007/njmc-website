import assert from 'node:assert/strict'
import { test } from 'node:test'

import { contact, nav } from '../src/lib/site.ts'

test('WhatsApp links use the exact wa.me format with country code 86', () => {
  for (const w of [contact.whatsappPrimary, contact.whatsappSecondary]) {
    assert.match(w.href, /^https:\/\/wa\.me\/86\d{11}$/)
  }
})

test('English and Arabic navigation mirror each other', () => {
  const shape = (items: typeof nav.en) => items.map((i) => (i.children ? i.children.length : 0))
  assert.deepEqual(shape(nav.en), shape(nav.ar))
  for (const [i, item] of nav.ar.entries()) {
    assert.equal(item.href, '/ar' + nav.en[i].href)
  }
})

test('every internal link uses the trailing-slash form', () => {
  const all = [...nav.en, ...nav.ar].flatMap((i) => [i, ...(i.children ?? [])])
  for (const i of all) assert.match(i.href, /\/$/)
})
