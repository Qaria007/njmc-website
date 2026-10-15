import { createHmac } from 'node:crypto'
import { promises as dns } from 'node:dns'

// Visitor sessions for the website statistics (collection visits). Pure helpers, tested in
// tests/visits.test.ts. Nothing here stores an IP address: the visitor code is a one-way hash
// of address + browser + day + the server secret, so it cannot be reversed and it changes daily.

export function visitorCode(ip: string, ua: string, day: string, secret: string): string {
  return createHmac('sha256', secret || 'no-secret').update(`${day}|${ip}|${ua}`).digest('hex').slice(0, 24)
}

// "Shanghai, CN" style names from the GeoIP country code, in English.
const names = new Intl.DisplayNames(['en'], { type: 'region' })
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return ''
  try {
    return names.of(code) || code
  } catch {
    return code
  }
}

// The network a visit came from, from the reverse DNS name of the address: the host number is
// dropped and the registered part kept, e.g. "ppp-12-34.dynamic.chello.nl" -> "chello.nl",
// "mail.aramco.com.sa" -> "aramco.com.sa". Unknown or missing names give "".
export function networkName(host: string): string {
  const h = host.toLowerCase().replace(/\.$/, '')
  if (!/^[a-z0-9.-]+$/.test(h) || !h.includes('.')) return ''
  const parts = h.split('.')
  // Country second-level domains (co.uk, com.sa, com.cn ...) keep three labels, others two.
  const sld = /^(com|co|net|org|gov|edu|ac|or|ne)$/.test(parts[parts.length - 2]) && parts[parts.length - 1].length === 2
  return parts.slice(sld ? -3 : -2).join('.')
}

const cache = new Map<string, { host: string; t: number }>()
export async function reverseName(ip: string): Promise<string> {
  const hit = cache.get(ip)
  if (hit && Date.now() - hit.t < 6 * 3_600_000) return hit.host
  if (cache.size > 5000) cache.clear()
  let host = ''
  try {
    const r = await Promise.race([dns.reverse(ip), new Promise<string[]>((_, rej) => setTimeout(() => rej(new Error('timeout')), 1500))])
    host = networkName(r[0] || '')
  } catch {
    host = ''
  }
  cache.set(ip, { host, t: Date.now() })
  return host
}

export type Geo = { country: string; countryCode: string; city: string }
// geoip-lite (MaxMind GeoLite2, offline). Loaded lazily so the site works without the data files.
type GeoTable = { lookup: (ip: string) => { country?: string; city?: string; region?: string } | null }
let geo: GeoTable | null | undefined
export async function geoOf(ip: string): Promise<Geo> {
  const none = { country: '', countryCode: '', city: '' }
  if (!/^[0-9a-f.:]+$/i.test(ip) || ip === 'unknown' || /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1)/.test(ip)) return none
  try {
    if (geo === undefined) {
      const m = (await import('geoip-lite')) as unknown as GeoTable & { default?: GeoTable }
      geo = m.default ?? m
    }
    const r = geo?.lookup(ip)
    if (!r?.country) return none
    return { country: countryName(r.country), countryCode: r.country, city: r.city || '' }
  } catch {
    return none
  }
}

export type SessionRow = { day: string; startedAt: string; country: string; city: string; network: string; source: string; device: string; lang: string; landing: string; pageCount: number; contactClicks: number }

// Dashboard numbers from the session rows of a period.
export function sessionStats(rows: SessionRow[], days: string[]) {
  const count = (key: (r: SessionRow) => string, n = 8) => {
    const m = new Map<string, number>()
    for (const r of rows) {
      const k = key(r)
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name, count]) => ({ name, count }))
  }
  const visitors = rows.length
  const pages = rows.reduce((n, r) => n + (r.pageCount || 0), 0)
  return {
    visitors,
    pagesPerVisit: visitors ? Math.round((pages / visitors) * 10) / 10 : 0,
    oneAndGone: visitors ? Math.round((rows.filter((r) => (r.pageCount || 0) <= 1).length / visitors) * 100) : 0,
    withContact: rows.filter((r) => r.contactClicks > 0).length,
    countries: count((r) => r.country),
    cities: count((r) => (r.city ? `${r.city}, ${r.country}` : '')),
    networks: count((r) => r.network, 10),
    landings: count((r) => r.landing),
    perDay: days.map((d) => ({ day: d, visitors: rows.filter((r) => r.day === d).length })),
  }
}
