import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import { geoOf, reverseName, visitorCode } from '../../lib/visits.ts'

// Receives one small beacon per page view or contact click from src/components/Track.tsx and
// adds 1 to that day's counter (collection page-views) and keeps the visitor's session for the day
// (collection visits: country and city from the offline GeoIP table, the network from reverse DNS,
// the pages in order). Stores no IP, no cookie, no user agent: the visitor code is a keyed hash that
// changes every day. Sessions older than 400 days are removed.
// Abuse limits: same-site requests only, page paths of the site's own shape, a per-connection
// rate limit (kept in memory, never stored) and a cap on new rows per day.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|python|curl|wget|httpclient/i
const KINDS = new Set(['view', 'whatsapp', 'email', 'phone'])
const PATH = /^\/(ar\/)?[a-z0-9\-/]{0,120}$/
const HOST = /^[a-z0-9.-]{1,80}$/
const OWN = new Set(['njmcmedicsupp.com', (process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/^https?:\/\//, '').replace(/[/:].*$/, '')])
const PER_MINUTE = 60
const NEW_ROWS_PER_DAY = 3000
const NEW_VISITS_PER_DAY = 3000
const KEEP_DAYS = 400

const hits = new Map<string, { n: number; t: number }>()
function limited(ip: string): boolean {
  const now = Date.now()
  if (hits.size > 5000) hits.clear()
  const h = hits.get(ip)
  if (!h || now - h.t > 60_000) {
    hits.set(ip, { n: 1, t: now })
    return false
  }
  h.n += 1
  return h.n > PER_MINUTE
}

function sourceOf(ref: unknown): string {
  if (typeof ref !== 'string' || !ref) return 'direct'
  try {
    const h = new URL(ref).hostname.toLowerCase().replace(/^www\./, '')
    if (OWN.has(h) || h === 'localhost') return 'internal'
    return HOST.test(h) ? h : 'other'
  } catch {
    return 'direct'
  }
}

let capDay = ''
let capped = false
let newVisits = 0
let cleanedDay = ''

export async function POST(req: Request): Promise<Response> {
  const ok = new Response(null, { status: 204 })
  const ua = req.headers.get('user-agent') || ''
  if (!ua || BOT.test(ua)) return ok
  const site = req.headers.get('sec-fetch-site')
  if (site && site !== 'same-origin') return ok
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown'
  if (limited(ip)) return ok
  let b: { p?: unknown; r?: unknown; k?: unknown }
  try {
    b = JSON.parse((await req.text()).slice(0, 2000))
  } catch {
    return ok
  }
  const kind = typeof b.k === 'string' && KINDS.has(b.k) ? b.k : 'view'
  if (typeof b.p !== 'string' || /^\/(admin|api|track|portal|quote|d)(\/|$)/.test(b.p)) return ok
  const raw = b.p.split(/[?#]/)[0].toLowerCase()
  const path = PATH.test(raw) ? raw : '/other'
  const lang = /^\/ar(\/|$)/.test(path) ? 'ar' : 'en'
  let source = sourceOf(b.r)
  let row = path
  const device = /mobi|android|iphone|ipad/i.test(ua) ? 'mobile' : 'computer'
  const day = new Date().toISOString().slice(0, 10)
  try {
    const payload = await getPayload({ config })
    const db = (payload.db as unknown as { drizzle: { execute: (q: unknown) => Promise<{ rows: { n: number }[] }> } }).drizzle
    if (capDay !== day) {
      capDay = day
      capped = false
      newVisits = 0
    }
    if (!capped) {
      const r = await db.execute(sql`SELECT count(*)::int AS n FROM page_views WHERE day = ${day}`)
      capped = (r.rows[0]?.n ?? 0) >= NEW_ROWS_PER_DAY
    }
    if (capped) {
      row = '/other'
      source = 'other'
    }
    // One atomic statement: a new counter row, or +1 on the existing one (unique index day_kind_path_lang_source_device_idx).
    await db.execute(sql`
      INSERT INTO page_views (day, kind, path, lang, source, device, count, updated_at, created_at)
      VALUES (${day}, ${kind}::enum_page_views_kind, ${row}, ${lang}, ${source}, ${device}, 1, now(), now())
      ON CONFLICT (day, kind, path, lang, source, device)
      DO UPDATE SET count = page_views.count + 1, updated_at = now()`)
    // The visitor's session for today (collection visits): country and city from the offline GeoIP
    // table, the network from reverse DNS, the pages in order. The address itself is never stored.
    // Counters are changed with one SQL statement each, so two beacons arriving together both count.
    if (!capped) {
      const visitor = visitorCode(ip, ua, day, process.env.PAYLOAD_SECRET || '')
      const now = new Date().toISOString()
      const isView = kind === 'view'
      const bump = async () => {
        const r = await db.execute(sql`
          UPDATE visits SET last_at = now(), page_count = page_count + ${isView ? 1 : 0}, contact_clicks = contact_clicks + ${isView ? 0 : 1}, updated_at = now()
          WHERE day = ${day} AND visitor = ${visitor} RETURNING id, page_count`)
        return r.rows[0] as unknown as { id: number; page_count: number } | undefined
      }
      let cur = await bump()
      if (!cur && newVisits < NEW_VISITS_PER_DAY) {
        newVisits += 1
        const g = await geoOf(ip)
        try {
          await payload.create({
            collection: 'visits', depth: 0, overrideAccess: true,
            data: {
              day, visitor, startedAt: now, lastAt: now, country: g.country, countryCode: g.countryCode, city: g.city, network: '', source, device, lang, landing: path,
              pageCount: isView ? 1 : 0, contactClicks: isView ? 0 : 1, pages: isView ? [{ path, at: now }] : [],
              summary: `${g.country || 'Unknown'}${g.city ? ', ' + g.city : ''}: ${path}`,
            },
          })
          // The network name is looked up once per session, after the row exists, so a slow DNS
          // answer never delays or loses a beacon.
          const network = await reverseName(ip)
          if (network) await db.execute(sql`UPDATE visits SET network = ${network} WHERE day = ${day} AND visitor = ${visitor}`)
        } catch {
          // Another beacon of the same visitor created the row first (unique day + visitor): count on it.
          cur = await bump()
          if (cur && isView) await db.execute(sql`INSERT INTO visits_pages (_order, _parent_id, id, path, at) VALUES (${cur.page_count}, ${cur.id}, ${visitor + '-' + cur.page_count}, ${path}, now())`)
        }
      } else if (cur && isView && cur.page_count <= 40) {
        await db.execute(sql`INSERT INTO visits_pages (_order, _parent_id, id, path, at) VALUES (${cur.page_count}, ${cur.id}, ${visitor + '-' + cur.page_count}, ${path}, now())`)
      }
      if (cleanedDay !== day) {
        cleanedDay = day
        const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10)
        await db.execute(sql`DELETE FROM visits WHERE day < ${cutoff}`)
      }
    }
  } catch {
    /* statistics must never break the site */
  }
  return ok
}
