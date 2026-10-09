import config from '@payload-config'
import { createLocalReq, getPayload } from 'payload'

import { saleByShareToken, sharedPdf, TYPES } from '@/collections/BuyerDocuments.ts'
import type { BuyerDocType } from '@/lib/trade-docs.ts'

// A client's private link to one of their documents (sent by WhatsApp). The long random key is the
// access; it works for 90 days and stops when the sale is cancelled. Never indexed.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string; type: string }> }) {
  const { token, type } = await params
  const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
  if (!TYPES.includes(type as BuyerDocType)) return new Response('Not found', { status: 404, headers })
  const payload = await getPayload({ config })
  const req = await createLocalReq({}, payload)
  const doc = await saleByShareToken(token, req, type as BuyerDocType)
  if (!doc) return new Response('This link is no longer active. Please ask us for the document again.', { status: 404, headers })
  const { bytes, fileName } = await sharedPdf(doc, type as BuyerDocType, req)
  return new Response(Buffer.from(bytes), { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${fileName}"` } })
}
