import type { Endpoint, PayloadHandler, PayloadRequest } from 'payload'

import { renderPdf } from '../lib/trade-pdf.ts'
import { buyerDocSpec, type BuyerDocType, buyerTotal, emailsIn, safeFileName } from '../lib/trade-docs.ts'
import { SITE_URL } from '../lib/site.ts'
import { toBuyerDoc } from './BuyerDocuments.ts'
import { loadSeller } from './TradeSettings.ts'

// The client portal's server side. Every endpoint works only for a signed-in portal login and only
// on sales of that login's own client. Drafts are never shown.
type Doc = Record<string, unknown> & { id: number | string }
const s = (v: unknown) => (v == null ? '' : String(v))
const idOf = (r: unknown) => (r && typeof r === 'object' ? String((r as Doc).id) : r == null ? '' : String(r))

function clientOf(req: PayloadRequest): string | null {
  const u = req.user as unknown as { collection?: string; client?: unknown; active?: boolean } | null
  if (u?.collection !== 'portal-users' || u.active === false) return null
  return idOf(u.client) || null
}
const nope = () => Response.json({ error: 'Please log in again' }, { status: 401 })

async function ownSale(req: PayloadRequest, id: string): Promise<Doc | null> {
  const client = clientOf(req)
  if (!client || !/^\d+$/.test(id)) return null
  const doc = (await req.payload.findByID({ collection: 'buyer-documents', id, depth: 0, overrideAccess: true, req, disableErrors: true })) as unknown as Doc | null
  if (!doc || idOf(doc.client) !== client || doc.status === 'draft') return null
  return doc
}

const VISIBLE_DOCS = (d: Doc): BuyerDocType[] => (s(d.invoiceNumber) ? ['pi', 'invoice', 'packing-list'] : ['pi'])

const salesHandler: PayloadHandler = async (req) => {
  const client = clientOf(req)
  if (!client) return nope()
  const res = await req.payload.find({
    collection: 'buyer-documents', where: { and: [{ client: { equals: client } }, { status: { not_equals: 'draft' } }] }, sort: '-piDate', limit: 100, depth: 0, overrideAccess: true, req,
  })
  const pays = await req.payload.find({ collection: 'payments', where: { and: [{ client: { equals: client } }, { direction: { equals: 'in' } }, { void: { not_equals: true } }] }, limit: 0, pagination: false, depth: 0, overrideAccess: true, req })
  const c = (await req.payload.findByID({ collection: 'clients', id: client, depth: 0, overrideAccess: true, req })) as unknown as Doc
  return Response.json({
    client: s(c.name),
    sales: (res.docs as unknown as Doc[]).map((d) => {
      const paid = (pays.docs as unknown as Doc[]).filter((p) => idOf(p.buyerDocument) === String(d.id) && s(p.currency) === (s(d.currency) || 'USD')).reduce((a, p) => a + Number(p.amount || 0), 0)
      return {
        id: d.id, number: s(d.piNumber), invoiceNumber: s(d.invoiceNumber), date: s(d.piDate).slice(0, 10), status: s(d.status), currency: s(d.currency) || 'USD',
        total: buyerTotal(toBuyerDoc(d)), paid: Math.round(paid * 100) / 100, validity: s(d.validity).slice(0, 10), paymentTerms: s(d.paymentTerms),
        items: ((d.items as Doc[]) ?? []).map((i) => ({ description: s(i.description), quantity: i.quantity, unit: s(i.unit) })),
        shipment: { ready: s(d.readyDate).slice(0, 10), etd: s(d.etd).slice(0, 10), eta: s(d.eta).slice(0, 10), forwarder: s(d.forwarder), bl: s(d.blNumber), vessel: s(d.vessel), documents: (d.documentsSent as string[]) ?? [] },
        docs: VISIBLE_DOCS(d), canConfirm: d.status === 'PI sent',
      }
    }),
  })
}

const pdfHandler: PayloadHandler = async (req) => {
  const q = (req.query ?? {}) as Record<string, unknown>
  const doc = await ownSale(req, s(q.id))
  const type = s(q.type) as BuyerDocType
  if (!doc || !VISIBLE_DOCS(doc).includes(type)) return Response.json({ error: 'Not found' }, { status: 404 })
  const spec = buyerDocSpec(toBuyerDoc(doc), await loadSeller(req.payload, req), type)
  return new Response(Buffer.from(await renderPdf(spec)), {
    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${safeFileName(spec.fileName)}"`, 'Cache-Control': 'no-store' },
  })
}

// Tell the team (Company details email and copy address) that a client did something in the portal.
async function notify(req: PayloadRequest, subject: string, text: string, doc: Doc) {
  const seller = await loadSeller(req.payload, req)
  const to = emailsIn([seller.copyTo, seller.email].join(','))
  try {
    if (to.length && process.env.SMTP_HOST) await req.payload.sendEmail({ to, subject, text: `${text}\n\n${SITE_URL.replace(/\/$/, '')}/admin/collections/buyer-documents/${doc.id}` })
  } catch {
    // the record already shows it
  }
  await req.payload.create({
    collection: 'inbox-messages', overrideAccess: true, depth: 0, req,
    data: { messageId: `portal-${doc.id}-${Date.now()}`, receivedAt: new Date().toISOString(), from: `Client portal (${s(req.user?.email)})`, subject, docNumber: s(doc.invoiceNumber) || s(doc.piNumber), text, buyerDocument: doc.id } as never,
  })
}

const appendLog = (doc: Doc, line: string) => [s(doc.sendLog), `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC: ${line}`].filter(Boolean).join('\n')

const confirmHandler: PayloadHandler = async (req) => {
  const body = ((await req.json?.().catch(() => null)) ?? null) as { id?: string } | null
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '') || !body) return Response.json({ error: 'Send JSON' }, { status: 415 })
  const doc = await ownSale(req, s(body.id))
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 })
  if (doc.status !== 'PI sent') return Response.json({ error: 'This proforma invoice cannot be confirmed now' }, { status: 400 })
  await req.payload.update({ collection: 'buyer-documents', id: doc.id, depth: 0, overrideAccess: true, req, data: { status: 'confirmed', sendLog: appendLog(doc, `confirmed by the client in the portal (${s(req.user?.email)})`) } as never })
  await notify(req, `Client confirmed ${s(doc.piNumber)}`, `${s(req.user?.email)} confirmed the proforma invoice ${s(doc.piNumber)} in the client portal.`, doc)
  return Response.json({ ok: true })
}

// POST multipart: id + file (the payment slip). Saved to Documents, linked to the sale and client.
const slipHandler: PayloadHandler = async (req) => {
  const client = clientOf(req)
  if (!client) return nope()
  const form = await req.formData?.().catch(() => null)
  const id = s(form?.get('id'))
  const file = form?.get('file')
  const doc = await ownSale(req, id)
  if (!doc) return Response.json({ error: 'Not found' }, { status: 404 })
  if (!file || typeof file === 'string') return Response.json({ error: 'Choose the file' }, { status: 400 })
  const f = file as File
  if (f.size > 10_000_000) return Response.json({ error: 'The file is larger than 10 MB' }, { status: 400 })
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(f.name)) return Response.json({ error: 'Send a PDF or a photo' }, { status: 400 })
  try {
    await req.payload.create({
      collection: 'trade-files', overrideAccess: true, depth: 0, req,
      data: { title: `Payment slip from the client portal (${s(req.user?.email)})`, kind: 'payment', date: new Date().toISOString(), client: Number(client), buyerDocument: doc.id, ...(idOf(doc.order) ? { order: Number(idOf(doc.order)) } : {}) } as never,
      file: { data: Buffer.from(await f.arrayBuffer()), mimetype: f.type || 'application/octet-stream', name: f.name.replace(/[^\w. -]+/g, '_'), size: f.size },
    })
  } catch (e) {
    req.payload.logger.error({ name: (e as Error)?.name, msg: process.env.NODE_ENV === 'production' ? undefined : (e as Error)?.message }, 'portal slip not saved')
    return Response.json({ error: 'The file could not be saved. Send a PDF or a photo' }, { status: 400 })
  }
  await req.payload.update({ collection: 'buyer-documents', id: doc.id, depth: 0, overrideAccess: true, req, data: { sendLog: appendLog(doc, `payment slip uploaded by the client in the portal (${s(req.user?.email)})`) } as never })
  await notify(req, `Payment slip received for ${s(doc.invoiceNumber) || s(doc.piNumber)}`, `${s(req.user?.email)} uploaded a payment slip in the client portal. Check the bank and record the payment.`, doc)
  return Response.json({ ok: true })
}

export const portalEndpoints: Endpoint[] = [
  { path: '/portal/sales', method: 'get', handler: salesHandler },
  { path: '/portal/pdf', method: 'get', handler: pdfHandler },
  { path: '/portal/confirm', method: 'post', handler: confirmHandler },
  { path: '/portal/slip', method: 'post', handler: slipHandler },
]
