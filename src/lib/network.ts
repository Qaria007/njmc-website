// The supplier network: company installations of this software (Trade Manager, sold through
// phmnai.com) ask the NJMC master for suppliers of a product and get a capped answer. This file is
// the pure part, shared by the master (src/collections/Network.ts) and the clients
// (src/lib/network-client.ts): plans and caps, the standing of a supplier, the ranking, the keys.
//
// Owner decisions (17 Oct 2026):
// - "Up to" N suppliers per product, depending on availability: Starter 3, Business 5.
// - A product searched again shows the SAME suppliers, never N new ones (one reveal per product,
//   kept for good); the monthly cap counts distinct products: Starter 20, Business 60.
// - Nothing leaves the master as a list: only the suppliers for the product asked, on screen.
// - A client's own suppliers are his; sharing one with the network is a switch, off by default,
//   and moves only public facts (name, country, website, what they make). Reward: 2 extra
//   product searches that month per shared supplier.
// - The network's signals (enquiry sent, reply, order, problem) feed the master's scorecard, so
//   the N suppliers shown are the best behaved ones. Golden is earned, never bought.
import { createHash } from 'node:crypto'

// Trial (owner, 17 Oct 2026): a prospect tries three product searches for free; the owner
// switches the plan to Starter or Business when he pays.
export type Plan = 'trial' | 'starter' | 'business'
export const PLANS: Record<Plan, { label: string; perProduct: number; perMonth: number }> = {
  trial: { label: 'Free trial', perProduct: 3, perMonth: 3 },
  starter: { label: 'Starter', perProduct: 3, perMonth: 20 },
  business: { label: 'Business', perProduct: 5, perMonth: 60 },
}
export const BONUS_PER_SHARE = 2
export const MAX_SHARES_PER_MONTH = 5
export const MAX_LINES = 50

export const SIGNAL_EVENTS = ['enquiry_sent', 'replied', 'quoted', 'ordered', 'delivered', 'problem', 'shared'] as const
export type SignalEvent = (typeof SIGNAL_EVENTS)[number]

// How a supplier behaves, own dealings and the network's together.
export type Stats = { enquiries: number; answered: number; avgReplyDays: number | null; orders: number; problems: number }
export type Standing = 'golden' | 'normal' | 'new' | 'silent' | 'flagged'
export const STANDING_LABEL: Record<Standing, string> = {
  golden: 'Golden: answers fast and has delivered orders',
  normal: 'Answers enquiries',
  new: 'No dealings recorded yet',
  silent: 'No reply recorded to 3 or more enquiries',
  flagged: 'A problem was reported: check before ordering',
}

export const emptyStats = (): Stats => ({ enquiries: 0, answered: 0, avgReplyDays: null, orders: 0, problems: 0 })

export function standingOf(s: Stats): Standing {
  if (s.problems > 0) return 'flagged'
  if (s.answered > 0 && s.avgReplyDays != null && s.avgReplyDays <= 3 && s.orders > 0) return 'golden'
  if (s.enquiries >= 3 && s.answered === 0) return 'silent'
  if (s.enquiries === 0 && s.orders === 0) return 'new'
  return 'normal'
}

export type Candidate = { id: string; name: string; rating?: string | null; email?: string | null; stats: Stats }

// Best first: standing, then how often they answer, then our own rating, then whether they have an
// e-mail (a supplier the client can actually write to), then the name so the order is stable.
const ORDER: Record<Standing, number> = { golden: 0, normal: 1, new: 2, silent: 3, flagged: 4 }
export function rankSuppliers<T extends Candidate>(list: T[]): T[] {
  const rate = (s: Stats) => (s.enquiries ? s.answered / s.enquiries : -1)
  return [...list].sort((a, b) => {
    const d = ORDER[standingOf(a.stats)] - ORDER[standingOf(b.stats)]
    if (d) return d
    const r = rate(b.stats) - rate(a.stats)
    if (r) return r
    const g = (Number(b.rating) || 0) - (Number(a.rating) || 0)
    if (g) return g
    const e = Number(Boolean(b.email)) - Number(Boolean(a.email))
    if (e) return e
    return a.name.localeCompare(b.name)
  })
}

// Signals folded into stats: one row per event from the network.
export type SignalRow = { supplierId: string; event: SignalEvent; days?: number | null; clientId?: string }
export function statsFromSignals(rows: SignalRow[]): Map<string, Stats> {
  const m = new Map<string, Stats>()
  const days = new Map<string, number[]>()
  // A problem counts once per company that reported it, so one company cannot flag a supplier harder by repeating itself.
  const problemBy = new Map<string, Set<string>>()
  for (const r of rows) {
    if (r.event === 'shared') continue // a share is not a dealing
    const s = m.get(r.supplierId) ?? emptyStats()
    m.set(r.supplierId, s)
    if (r.event === 'enquiry_sent') s.enquiries++
    else if (r.event === 'replied' || r.event === 'quoted') {
      s.answered++
      if (r.days != null && r.days >= 0) days.set(r.supplierId, [...(days.get(r.supplierId) ?? []), r.days])
    } else if (r.event === 'ordered' || r.event === 'delivered') s.orders++
    else if (r.event === 'problem') {
      const set = problemBy.get(r.supplierId) ?? new Set<string>()
      set.add(r.clientId ?? `#${set.size}`)
      problemBy.set(r.supplierId, set)
      s.problems = set.size
    }
  }
  for (const [id, d] of days) {
    const s = m.get(id)
    if (s) s.avgReplyDays = Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10
  }
  return m
}

export function mergeStats(a: Stats, b: Stats): Stats {
  const answeredDays = [a, b].filter((s) => s.avgReplyDays != null && s.answered > 0)
  const avg = answeredDays.length ? answeredDays.reduce((t, s) => t + (s.avgReplyDays as number) * s.answered, 0) / answeredDays.reduce((t, s) => t + s.answered, 0) : null
  return { enquiries: a.enquiries + b.enquiries, answered: a.answered + b.answered, avgReplyDays: avg == null ? null : Math.round(avg * 10) / 10, orders: a.orders + b.orders, problems: a.problems + b.problems }
}

// The monthly allowance: the plan's products plus the bonus for suppliers shared this month.
export function monthlyLimit(plan: Plan, sharesThisMonth: number): number {
  return PLANS[plan].perMonth + BONUS_PER_SHARE * Math.max(0, sharesThisMonth)
}

export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7)
// Names compared without case, spaces and punctuation: "ACME Co." and "acme co" are one supplier.
export const nameKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
export const productKey = (productId: number | string) => `p:${productId}`

// What a client sees about one supplier: public facts and the standing, never prices or history.
export type NetworkSupplier = {
  ref: string; name: string; country: string; city: string; website: string; email: string; phone: string; wechat: string
  listedAs: string; documents: string; standing: Standing
}
export type NetworkLine = { requested: string; product: string; suppliers: NetworkSupplier[]; limitReached?: boolean }
export type Usage = { plan: Plan; perProduct: number; used: number; limit: number; month: string; shares: number }
export type SearchResult = { lines: NetworkLine[]; usage: Usage }

export const usageText = (u: Usage) => `Supplier network (${PLANS[u.plan].label}): ${u.used} of ${u.limit} product searches used in ${u.month}, up to ${u.perProduct} suppliers per product.`
