// AI mode: reads a supplier's reply (pasted email or WeChat text) into the quotation fields. Off
// unless the owner switches AI mode on and saves an API key in Company details. Nothing is saved
// from here: the result is shown for review and only "Apply" writes it.
import Anthropic from '@anthropic-ai/sdk'

export const AI_MODELS = [
  { label: 'Claude Opus 5.5 (best)', value: 'claude-opus-5-5' },
  { label: 'Claude Sonnet 5.5 (cheaper)', value: 'claude-sonnet-5-5' },
  { label: 'Claude Haiku 5.5 (cheapest)', value: 'claude-haiku-5-5' },
]
export const DEFAULT_AI_MODEL = 'claude-opus-5-5'

export type QuoteItemRef = { id: string; material: string; spec?: string | null; quantity?: number | null; unit?: string | null }
export type AiQuote = {
  currency: string; incoterm: string; incotermPlace: string; validUntil: string; paymentTerms: string; contactName: string; notes: string
  items: { id: string; price: string; moq: string; leadTime: string; note: string }[]
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['currency', 'incoterm', 'incotermPlace', 'validUntil', 'paymentTerms', 'contactName', 'notes', 'items'],
  properties: {
    currency: { type: 'string', description: 'USD, CNY or EUR; empty if not stated' },
    incoterm: { type: 'string', description: 'EXW, FCA, FOB, CFR, CIF, CPT, CIP, DAP or DDP; empty if not stated' },
    incotermPlace: { type: 'string' },
    validUntil: { type: 'string', description: 'YYYY-MM-DD, or empty' },
    paymentTerms: { type: 'string' },
    contactName: { type: 'string' },
    notes: { type: 'string', description: 'Anything else the supplier said that matters to the buyer (packing, documents, DMF, CEP), in English' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'price', 'moq', 'leadTime', 'note'],
        properties: {
          id: { type: 'string', description: 'The id of the enquiry item this price is for' },
          price: { type: 'string', description: 'Price per unit of the enquiry item, digits and a dot only, e.g. 12.50; empty if no price for this item' },
          moq: { type: 'string' },
          leadTime: { type: 'string' },
          note: { type: 'string', description: 'Grade, packing or condition for this item, in English' },
        },
      },
    },
  },
} as const

const SYSTEM = `You read a supplier's reply to a pharmaceutical purchase enquiry and copy the quotation into fields.
Copy only what the supplier wrote. Never estimate, convert or calculate a price, and never fill a field the reply does not state: leave it empty.
If a price is per a different unit than the enquiry item (for example per ton when the item is in kg), leave the price empty and say so in that item's note.
Write notes in English even when the reply is in Chinese.`

export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'The AI key was refused (wrong or expired). Paste a new key in Company details.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'The AI service refused access: the key has no access to this model, or this server\'s country is not supported.'
  if (e instanceof Anthropic.RateLimitError) return 'The AI service is busy or the account has no credit left. Try again later or check the billing page.'
  if (e instanceof Anthropic.BadRequestError) return `The AI service refused the request: ${e.message}`.slice(0, 300)
  if (e instanceof Anthropic.APIError) return `The AI service failed (${e.status ?? 'no answer'}). Try again.`
  return 'The AI service could not be reached. Try again.'
}

export async function readQuoteWithAi(apiKey: string, model: string, reply: string, items: QuoteItemRef[]): Promise<AiQuote> {
  const client = new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })
  const list = items.map((i) => `- id ${i.id}: ${i.material}${i.spec ? `, ${i.spec}` : ''}${i.quantity != null ? `, ${i.quantity} ${i.unit || 'kg'}` : ''}`).join('\n')
  const res = await client.beta.messages.create({
    model,
    max_tokens: 16000,
    system: SYSTEM,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: `Enquiry items:\n${list}\n\nSupplier's reply:\n<reply>\n${reply.slice(0, 60000)}\n</reply>` }],
  } as never) as unknown as Anthropic.Beta.BetaMessage
  if (res.stop_reason === 'refusal') throw new Error('The AI declined to read this text.')
  if (res.stop_reason === 'max_tokens') throw new Error('The reply is too long for one reading.')
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const out = JSON.parse(text) as AiQuote
  const ids = new Set(items.map((i) => i.id))
  out.items = (out.items ?? []).filter((i) => ids.has(i.id))
  return out
}

// A small call to check that a newly pasted key works.
export async function testAiKey(apiKey: string, model: string): Promise<void> {
  const client = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 0 })
  await client.models.retrieve(model)
}
