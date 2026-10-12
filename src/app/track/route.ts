import config from '@payload-config'
import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

// Receives one small beacon per page view or contact click from src/components/Track.tsx and
// adds 1 to that day's counter (collection page-views). Stores no IP, no cookie, no user agent:
// only the page, the language, the referring website's host name, phone/computer and the kind.
// Abuse limits: same-site requests only, page paths of the site's own shape, a per-connection
// rate limit (kept in memory, never stored) and a cap on new rows per day.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|python|curl|wget|httpclient/i
const KINDS = new Set(['view', 'whatsapp', 'email', 'phone'])
const PATH = /^\/(ar\/)?[a-z0-9\-/]{0,120}$/
const HOST = /^[a-z0-9.-]{1,80}$/
const OWN = new Set(['njmcmedicsupp.com', (process.env.NEXT_PUBLIC_SERVER_URL || '').replace(/^https?:\/\//, '').replace(/[/:].*$/, '')])
const PER_MINUTE = 60
const NEW_ROWS_PER_DAY = 3000

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
  } catch {
    /* statistics must never break the site */
  }
  return ok
}
