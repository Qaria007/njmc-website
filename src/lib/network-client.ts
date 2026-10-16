// A company installation's side of the supplier network: calls to the NJMC master. Present only
// when the installation was made with NETWORK_URL and NETWORK_TOKEN (deploy/new-company.sh);
// NJMC's own installation has neither and never calls itself. Every call fails soft: a search
// problem becomes a note on the order, a signal that cannot be sent is logged and forgotten.
import type { Payload } from 'payload'

import { MAX_LINES, type SearchResult, type SignalEvent, type Usage } from './network.ts'

export const networkEnabled = () => Boolean(process.env.NETWORK_URL && process.env.NETWORK_TOKEN)

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const base = String(process.env.NETWORK_URL).replace(/\/$/, '')
  const r = await fetch(`${base}/api/network/${path}/`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Network-Token': String(process.env.NETWORK_TOKEN) },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  const j = (await r.json().catch(() => ({}))) as T & { error?: string }
  if (!r.ok) throw new Error(j.error || `the supplier network answered ${r.status}`)
  return j
}

export type SearchLine = { requested: string; cas?: string; grade?: string; quantity?: string }
export const networkSearch = (lines: SearchLine[]) => call<SearchResult>('search', 'POST', { lines: lines.slice(0, MAX_LINES) })
export const networkUsage = () => call<{ usage: Usage }>('usage', 'GET').then((j) => j.usage)
export const networkShare = (supplier: { name: string; nameLocal?: string; country: string; city?: string; website?: string; supplies?: string[]; notes?: string }) =>
  call<{ ok: boolean; sharesThisMonth: number }>('share', 'POST', supplier)

// Tells the master how a network supplier behaved with us. Fire and forget: never blocks a save.
export function signalSupplier(payload: Payload, supplierId: number | string | null | undefined, event: SignalEvent, days?: number | null): void {
  if (!networkEnabled() || supplierId == null) return
  void (async () => {
    try {
      const sup = (await payload.findByID({ collection: 'suppliers', id: supplierId, depth: 0, overrideAccess: true })) as unknown as { networkRef?: string | null }
      if (!sup?.networkRef) return
      await call('signal', 'POST', { supplierRef: sup.networkRef, event, days: days ?? null })
    } catch (err) {
      payload.logger.warn({ err: (err as Error).message, event }, 'supplier network signal not sent')
    }
  })()
}
