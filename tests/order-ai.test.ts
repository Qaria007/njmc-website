import assert from 'node:assert/strict'
import { test } from 'node:test'

import sharp from 'sharp'

import { readOrderWithAi } from '../src/lib/order-ai.ts'
import { parseOrder } from '../src/lib/order-parse.ts'

// A fake OpenAI answer: no network, no key. Checks what is sent and how the answer becomes order rows.
function fakeOpenAi(answer: unknown, seen: { body?: Record<string, unknown> }) {
  const real = globalThis.fetch
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    seen.body = JSON.parse(String(init.body))
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(answer) }, finish_reason: 'stop' }] }), { status: 200 })
  }) as typeof fetch
  return () => {
    globalThis.fetch = real
  }
}

const photo = () => sharp({ create: { width: 3000, height: 1200, channels: 3, background: 'white' } }).png().toBuffer()

test('photos and scans are flagged for the AI instead of being guessed', async () => {
  const p = await parseOrder(await photo(), 'order.png', 'image/png')
  assert.equal(p.needsAi, true)
  assert.equal(p.rows.length, 0)
  assert.match(p.note, /AI key in Company details/)
})

test('a photo read by the AI becomes order rows, the photo sent smaller as JPEG', async () => {
  const seen: { body?: Record<string, unknown> } = {}
  const restore = fakeOpenAi({
    items: [
      { name: 'Mesalazine', cas: '89-57-6', grade: 'EP', quantity: '500 kg' },
      { name: '卡波姆 (Carbomer 940)', cas: '', grade: 'USP', quantity: '200 kg' },
      { name: '', cas: '', grade: '', quantity: '' },
    ],
    note: '',
  }, seen)
  try {
    const p = await readOrderWithAi({ apiKey: 'sk-test', model: 'gpt-5' }, await photo(), 'order.png')
    assert.equal(p.rows.length, 2)
    assert.deepEqual(p.rows[0], { text: 'Mesalazine', cas: '89-57-6', grade: 'EP', quantity: '500 kg', row: 1, aliases: [] })
    assert.deepEqual(p.rows[1].aliases, ['Carbomer 940'])
    assert.match(p.note, /^Photo read by the AI: 2 materials/)
    const content = (seen.body?.messages as { content: unknown }[])[1].content as { type: string; image_url?: { url: string } }[]
    const url = content.find((c) => c.type === 'image_url')!.image_url!.url
    assert.ok(url.startsWith('data:image/jpeg;base64,'))
    const meta = await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata()
    assert.equal(meta.width, 2400)
  } finally {
    restore()
  }
})

test('an AI failure is reported, not hidden', async () => {
  const p = await readOrderWithAi({ apiKey: 'sk-ant-x', model: 'gpt-5' }, await photo(), 'scan.pdf')
  assert.equal(p.rows.length, 0)
  assert.match(p.note, /^Scanned PDF: the AI could not read it .*Claude \(Anthropic\) key/)
})
