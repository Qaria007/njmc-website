import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mailHtml, textToHtml } from '../src/lib/mail-html.ts'

const brand = { brand: 'NJMC Medical Supplies', legalName: 'Medicayal Pharma Co., Ltd.', website: 'www.njmcmedicsupp.com', phone: '+86 132 4453 6191', email: 'sale@njmcmedicsupp.com' }

test('plain text becomes paragraphs, a numbered list and a signature block', () => {
  const text = 'Dear Sales Team,\n\nPlease quote:\n\n1. Patient monitor, 2 units\n2. Syringe pump <5 ml>, 1 unit\n\nThank you.\n\nBest regards,\n\nDr. Qaria\nNJMC Medical Supplies\nwww.njmcmedicsupp.com'
  const h = textToHtml(text, brand)
  assert.ok(h.startsWith('<p dir="auto" style="margin:0 0 14px 0">Dear Sales Team,</p>'))
  assert.ok(h.includes('<ol') && h.includes('<li dir="auto" style="margin:0 0 6px 0">Patient monitor, 2 units</li>'))
  assert.ok(h.includes('Syringe pump &lt;5 ml&gt;'), 'html is escaped')
  assert.ok(h.includes('font-weight:bold;font-size:15px;color:#111">Dr. Qaria'), 'name in bold, guessed from the typed signature')
  assert.ok(h.includes('>NJMC</td>'), 'badge with the initials')
  assert.ok(h.includes('WhatsApp +86 132 4453 6191'), 'contact line from the settings')
  assert.ok(h.includes('color:#1F3A5F;margin-top:2px">NJMC Medical Supplies'), 'brand in dark blue')
  assert.ok(h.includes('href="https://www.njmcmedicsupp.com"'), 'website linked')
  const named = textToHtml(text, { ...brand, signatoryName: 'Dr. Majid', signatoryTitle: 'Managing Director' })
  assert.ok(named.includes('>Dr. Majid</div>') && named.includes('>Managing Director</div>'), 'settings win over the typed name')
})

test('the full mail has the brand bar and the footer, and survives odd input', () => {
  const h = mailHtml('Hello', brand)
  assert.ok(h.includes('<!DOCTYPE html>') && h.includes('>NJMC Medical Supplies</td>') && h.includes('Medicayal Pharma Co., Ltd.'))
  assert.ok(h.includes('Tel +86 132 4453 6191'))
  assert.equal(textToHtml('', brand), '')
  assert.ok(textToHtml('- a\n- b\n\nx', brand).includes('<ul'))
})

test('lists keep their numbering across blank lines, links drop trailing punctuation, decimals stay', () => {
  const h = textToHtml('1. Amoxicillin\n\n2. Paracetamol\n\nSee www.njmcmedicsupp.com.', { brand: 'NJMC Medical Supplies' })
  assert.equal((h.match(/<ol/g) || []).length, 1)
  assert.ok(h.includes('href="https://www.njmcmedicsupp.com"') && h.includes('</a>.'))
  const s = textToHtml('3. Item three\n4. Item four', { brand: 'NJMC Medical Supplies' })
  assert.ok(s.includes('<ol start="3"'))
})
