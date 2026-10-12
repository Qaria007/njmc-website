// Reads a customer order that is a photo, a screenshot or a scanned PDF (no text layer) with the
// AI set in Company details, into the same rows as order-parse.ts. Only used when AI mode is on.
// The AI copies what is written; the matcher then finds the suppliers as for any other file.
import sharp from 'sharp'

import { type AiFile, aiErrorMessage, aiJson, AiReadError } from './ai.ts'
import type { OrderRow } from './order-match.ts'
import type { ParsedOrder } from './order-parse.ts'

export const IMAGE = /\.(jpe?g|png|webp)$/i

type Answer = { items: { name: string; cas: string; grade: string; quantity: string }[]; note: string }

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'note'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'cas', 'grade', 'quantity'],
        properties: { name: { type: 'string' }, cas: { type: 'string' }, grade: { type: 'string' }, quantity: { type: 'string' } },
      },
    },
    note: { type: 'string' },
  },
}

const SYSTEM = [
  "You read a customer's order or enquiry for pharmaceutical raw materials, excipients or medical supplies (a photo, a screenshot or a scanned page) for a sourcing company.",
  'List every material the customer asks for, in the order written, one item per material.',
  'Copy the name, CAS number, grade or pharmacopoeia (for example BP, USP, EP) and the quantity with its unit exactly as written. Never correct, guess or add anything; leave a field empty when it is not on the page.',
  'When a name is written in Chinese or Arabic, keep it as written and add the English name in brackets only when you are certain of it.',
  'Ignore addresses, greetings, prices, totals, signatures and stamps.',
  'note: one short sentence about anything you could not read, else an empty string.',
].join(' ')

// Photos are turned upright and made smaller (the AI does not need more than 2400 px).
async function toAiFile(buf: Buffer, filename: string): Promise<AiFile> {
  if (!IMAGE.test(filename)) return { name: filename, mediaType: 'application/pdf', data: buf.toString('base64') }
  const jpg = await sharp(buf).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer()
  return { name: filename.replace(/\.\w+$/, '.jpg'), mediaType: 'image/jpeg', data: jpg.toString('base64') }
}

const bracketed = (name: string) => [...name.matchAll(/\(([^()]*[A-Za-z]{3,}[^()]*)\)/g)].map((m) => m[1].trim())

export async function readOrderWithAi(ai: { apiKey: string; model: string }, buf: Buffer, filename: string): Promise<ParsedOrder> {
  const what = IMAGE.test(filename) ? 'Photo' : 'Scanned PDF'
  try {
    const a = await aiJson<Answer>(ai.apiKey, ai.model, SYSTEM, 'List the materials in this order.', SCHEMA, 'order', [await toAiFile(buf, filename)])
    const items = (a.items ?? []).filter((i) => i.name?.trim() || i.cas?.trim())
    const rows: OrderRow[] = items.map((i, k) => ({
      text: (i.name || i.cas).trim(),
      cas: i.cas?.trim() || undefined,
      grade: i.grade?.trim() || undefined,
      quantity: i.quantity?.trim() || undefined,
      row: k + 1,
      aliases: bracketed(i.name || ''),
    }))
    const text = items.map((i) => [i.name, i.cas, i.grade, i.quantity].filter(Boolean).join(' ')).join('\n')
    const note = `${what} read by the AI: ${rows.length} material${rows.length === 1 ? '' : 's'}. Check them against the original.${a.note ? ` ${a.note}` : ''}`
    return { rows, text, note }
  } catch (e) {
    return { rows: [], text: '', note: `${what}: the AI could not read it (${e instanceof AiReadError ? e.message : aiErrorMessage(e)}). Type the materials into "Materials (typed)" instead.` }
  }
}
