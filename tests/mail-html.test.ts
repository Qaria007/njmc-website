import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mailHtml, textToHtml } from '../src/lib/mail-html.ts'

const brand = { brand: 'NJMC Medical Supplies', legalName: 'Medicayal Pharma Co., Ltd.', website: 'www.njmcmedicsupp.com', phone: '+86 132 4453 6191', email: 'sale@njmcmedicsupp.com' }

test('plain text becomes paragraphs, a numbered list and a signature block', () => {
  const text = 'Dear Sales Team,\n\nPlease quote:\n\n1. Patient monitor, 2 units\n2. Syringe pump <5 ml>, 1 unit\n\nThank you.\n\nBest regards,\n\nDr. Qaria\nNJMC Medical Supplies\nwww.njmcmedicsupp.com'
  const h = textToHtml(text, brand)
  assert.ok(h.startsWith('<p style="margin:0 0 14px 0">Dear Sales Team,</p>'))
  assert.ok(h.includes('<ol') && h.includes('<li style="margin:0 0 6px 0">Patient monitor, 2 units</li>'))
  assert.ok(h.includes('Syringe pump &lt;5 ml&gt;'), 'html is escaped')
  assert.ok(h.includes('font-weight:bold;color:#111">Dr. Qaria'), 'name in bold')
  assert.ok(h.includes('color:#1F3A5F">NJMC Medical Supplies'), 'brand in dark blue')
  assert.ok(h.includes('href="https://www.njmcmedicsupp.com"'), 'website linked')
})

test('the full mail has the brand bar and the footer, and survives odd input', () => {
  const h = mailHtml('Hello', brand)
  assert.ok(h.includes('<!DOCTYPE html>') && h.includes('>NJMC Medical Supplies</td>') && h.includes('Medicayal Pharma Co., Ltd.'))
  assert.ok(h.includes('Tel +86 132 4453 6191'))
  assert.equal(textToHtml('', brand), '')
  assert.ok(textToHtml('- a\n- b\n\nx', brand).includes('<ul'))
})
