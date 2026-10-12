'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// The admin home page: search everything, quick actions, money at a glance, and the list of what
// needs doing today, with reminders that are always shown and confirmed before they are sent.
type Task = { kind: string; title: string; detail: string; href: string; age?: number; due?: string; done?: string; action?: { type: 'remind-supplier' | 'remind-client'; id: string } }
type Tasks = Record<string, Task[]>
type Totals = { received: number; paidSuppliers: number; expenses: number; cashNet: number; receivable: number; payable: number; profit: number }
type Today = { tasks: Tasks; money: { month: Totals; all: Totals; missingRates: string[] } | null }
type Hit = { type: string; title: string; detail: string; href: string }
type Point = { date: string; kind: string; party: string; material: string; price: number; currency: string; usd: number | null; unit: string; ref: string; href: string }

const card: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 6, padding: 14, background: 'var(--theme-elevation-0)' }
const muted: React.CSSProperties = { opacity: 0.7, fontSize: 12 }
const fmt = (n: number | null | undefined) => (n == null ? 'n/a' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

const SECTIONS: [string, string, string][] = [
  ['emails', 'Emails received about our documents', 'Read them, then mark done'],
  ['newOrders', 'New customer orders', 'Message the suppliers'],
  ['coaChecks', 'Certificates of analysis to check', 'Check them with PharmaTrust'],
  ['overdueReplies', 'Suppliers who have not answered', 'Remind them'],
  ['pricesToUse', 'Prices received', 'Compare and make the PI'],
  ['waitingClient', 'PIs waiting for the client', 'Follow up'],
  ['paymentsDue', 'Clients who still owe us', 'Ask for payment'],
  ['supplierPayments', 'Suppliers we still owe', 'Pay them'],
  ['shipments', 'Shipments in the next 14 days', 'Keep the client informed'],
  ['expiringQuotes', 'Supplier prices about to expire', 'Order or ask again'],
  ['certificates', 'Supplier certificates expiring (suppliers in use)', 'Ask for renewals'],
]

// Shortcuts, grouped like the menu. Groups marked true are for the owner only.
const SHORTCUTS: [string, boolean, [string, string][]][] = [
  ['Customers', false, [
    ['Customer orders', '/admin/collections/order-matches'],
    ['Clients', '/admin/collections/clients'],
    ['Proforma invoices and invoices', '/admin/collections/buyer-documents'],
    ['Emails received', '/admin/collections/inbox-messages'],
  ]],
  ['Suppliers', false, [
    ['Enquiries and purchase orders', '/admin/collections/supplier-orders'],
    ['Suppliers', '/admin/collections/suppliers'],
    ['Supplier certificates', '/admin/collections/supplier-certificates'],
    ['Product catalogue', '/admin/collections/products'],
  ]],
  ['Documents', false, [
    ['Upload a document', '/admin/collections/trade-files/create'],
    ['All documents', '/admin/collections/trade-files'],
    ['Certificate on our letterhead', '/admin/collections/trader-coas/create'],
  ]],
  ['Money and settings', true, [
    ['Record a payment or cost', '/admin/collections/payments/create'],
    ['Accounts overview', '/admin/globals/accounts-overview'],
    ['Company details and AI', '/admin/globals/trade-settings'],
    ['Our companies', '/admin/collections/issuing-companies'],
  ]],
]

// To-do sections that need action first get a coloured edge.
const URGENT = new Set(['emails', 'newOrders', 'overdueReplies', 'paymentsDue'])
const SHOW = 5

type Visitors = {
  views: number; previousViews: number; mobile: number; arabic: number; whatsapp: number; email: number; phone: number; newEnquiries: number
  days: { day: string; views: number }[]; topPages: { name: string; count: number }[]; topSources: { name: string; count: number }[]
}

async function get(url: string) {
  const r = await fetch(url, { credentials: 'include' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `failed (${r.status})`)
  return j
}

function Remind({ action, onDone }: { action: NonNullable<Task['action']>; onDone: () => void }) {
  const type = action.type === 'remind-supplier' ? 'supplier' : 'client'
  const [d, setD] = useState<{ to: string[]; subject: string; body: string; you: string } | null>(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  useEffect(() => {
    get(`/api/desk/remind?type=${type}&id=${action.id}`)
      .then((j) => {
        setD(j)
        setSubject(j.subject)
        setBody(j.body)
      })
      .catch((e: Error) => setNote(e.message))
  }, [type, action.id])
  const send = async (test: boolean) => {
    setBusy(true)
    setNote('')
    try {
      const r = await fetch('/api/desk/remind/', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id: action.id, subject, body, ...(test ? { test: true } : { confirm: true }) }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'not sent')
      setNote(test ? `Test sent to ${j.to.join(', ')}.` : `Sent to ${j.to.join(', ')}. ${j.warning ?? ''}`)
      if (!test) {
        setSent(true)
        setTimeout(onDone, 1200)
      }
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }
  if (!d) return <p style={{ margin: '8px 0' }}>{note || 'Preparing the message'}</p>
  return (
    <div style={{ ...card, margin: '8px 0', background: 'var(--theme-elevation-50)' }}>
      <p style={{ margin: '0 0 6px' }}>To: <strong>{d.to.length ? d.to.join(', ') : 'no email on the record'}</strong></p>
      <input style={{ width: '100%', margin: '0 0 6px', padding: '4px 6px', font: 'inherit' }} value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea style={{ width: '100%', minHeight: 150, padding: '4px 6px', font: 'inherit' }} value={body} onChange={(e) => setBody(e.target.value)} />
      <p style={{ margin: '6px 0 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy || sent || !d.to.length} onClick={() => send(false)}>{sent ? 'Sent' : 'Confirm and send'}</button>
        <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={() => send(true)}>Send a test to myself</button>
        <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={onDone}>Close</button>
      </p>
      {note ? <p style={{ margin: '6px 0 0' }}>{note}</p> : null}
    </div>
  )
}

function Search() {
  const [term, setTerm] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (term.trim().length < 2) {
      setHits([])
      return
    }
    timer.current = setTimeout(() => {
      get(`/api/desk/search?q=${encodeURIComponent(term.trim())}`).then((j) => setHits(j.results)).catch(() => setHits([]))
    }, 250)
  }, [term])
  return (
    <div style={{ position: 'relative', flex: '1 1 320px' }}>
      <input
        aria-label="Search"
        placeholder="Search clients, suppliers, orders, PI or invoice numbers, materials, CAS"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', font: 'inherit', fontSize: 15, borderRadius: 6, border: '1px solid var(--theme-elevation-250)', boxSizing: 'border-box' }}
      />
      {hits.length ? (
        <div style={{ ...card, position: 'absolute', zIndex: 20, left: 0, right: 0, marginTop: 4, maxHeight: 380, overflowY: 'auto', boxShadow: '0 6px 24px rgba(0,0,0,0.15)' }}>
          {hits.map((h, i) => (
            <a key={i} href={h.href} style={{ display: 'block', padding: '6px 4px', textDecoration: 'none', borderBottom: '1px solid var(--theme-elevation-100)' }}>
              <span style={muted}>{h.type}</span> <strong>{h.title}</strong> {h.detail ? <span style={muted}>{h.detail}</span> : null}
            </a>
          ))}
        </div>
      ) : term.trim().length >= 2 ? null : null}
    </div>
  )
}

function PriceHistory() {
  const [term, setTerm] = useState('')
  const [points, setPoints] = useState<Point[] | null>(null)
  const [busy, setBusy] = useState(false)
  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      setPoints((await get(`/api/desk/price-history?q=${encodeURIComponent(term)}`)).points)
    } catch {
      setPoints([])
    }
    setBusy(false)
  }
  return (
    <div style={card}>
      <h3 style={{ margin: '0 0 8px' }}>Price history</h3>
      <form onSubmit={run} style={{ display: 'flex', gap: 8, margin: '0 0 8px' }}>
        <input placeholder="Material, e.g. mesalamine" value={term} onChange={(e) => setTerm(e.target.value)} style={{ flex: 1, padding: '6px 8px', font: 'inherit' }} />
        <button type="submit" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy || term.trim().length < 2}>Show</button>
      </form>
      {points == null ? <p style={{ ...muted, margin: 0 }}>Every price quoted to us, paid by us and sold by us for a material, newest first.</p> : null}
      {points && !points.length ? <p style={{ margin: 0 }}>No prices recorded for this material yet.</p> : null}
      {points && points.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>{['Date', 'What', 'Who', 'Price', 'USD', 'Ref.'].map((h) => <th key={h} style={{ textAlign: 'start', padding: 4, borderBottom: '1px solid var(--theme-elevation-150)' }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td style={{ padding: 4 }}>{p.date}</td>
                  <td style={{ padding: 4 }}>{p.kind === 'quoted' ? 'Quoted to us' : p.kind === 'bought' ? 'We bought' : 'We sold'}</td>
                  <td style={{ padding: 4 }}>{p.party}</td>
                  <td style={{ padding: 4, whiteSpace: 'nowrap' }}>{p.currency} {fmt(p.price)}/{p.unit}</td>
                  <td style={{ padding: 4 }}>{fmt(p.usd)}</td>
                  <td style={{ padding: 4 }}><a href={p.href}>{p.ref}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function Section({ title, hint, children, id }: { title: string; hint?: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} style={{ margin: '0 0 26px' }}>
      <h2 style={{ margin: '0 0 2px', fontSize: 20 }}>{title}</h2>
      {hint ? <p style={{ ...muted, margin: '0 0 10px', fontSize: 13 }}>{hint}</p> : <div style={{ height: 8 }} />}
      {children}
    </section>
  )
}

function Tile({ label, value, sub, href, accent }: { label: string; value: string | number; sub?: string; href?: string; accent?: string }) {
  const body = (
    <>
      <div style={muted}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.25 }}>{value}</div>
      {sub ? <div style={{ ...muted, marginTop: 2 }}>{sub}</div> : null}
    </>
  )
  const style: React.CSSProperties = { ...card, textDecoration: 'none', color: 'inherit', display: 'block', ...(accent ? { borderLeft: `4px solid ${accent}` } : {}) }
  return href ? <a href={href} style={style}>{body}</a> : <div style={style}>{body}</div>
}

function TopList({ title, rows, empty }: { title: string; rows: { name: string; count: number }[]; empty: string }) {
  return (
    <div style={card}>
      <strong>{title}</strong>
      {rows.length ? rows.map((r) => (
        <div key={r.name} dir="ltr" style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between', gap: 8, padding: '3px 0', borderTop: '1px solid var(--theme-elevation-100)' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span>{r.count}</span>
        </div>
      )) : <p style={{ ...muted, margin: '4px 0 0' }}>{empty}</p>}
    </div>
  )
}

function WebsiteVisitors() {
  const [v, setV] = useState<Visitors | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    get('/api/desk/visitors').then(setV).catch((e: Error) => setError(e.message))
  }, [])
  if (error) return <p>{error}</p>
  if (!v) return <p style={muted}>Loading</p>
  const pct = (n: number) => (v.views ? `${Math.round((n / v.views) * 100)}%` : '0%')
  const change = v.previousViews ? Math.round(((v.views - v.previousViews) / v.previousViews) * 100) : null
  const max = Math.max(1, ...v.days.map((d) => d.views))
  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, margin: '0 0 10px' }}>
        <Tile label="Page views" value={v.views} sub={change == null ? 'counting started this week' : `${change >= 0 ? '+' : ''}${change}% on the 7 days before`} href="/admin/collections/page-views" />
        <Tile label="On a phone" value={pct(v.mobile)} sub={`Arabic pages: ${pct(v.arabic)}`} />
        <Tile label="Contact clicks" value={v.whatsapp + v.email + v.phone} sub={`WhatsApp ${v.whatsapp}, email ${v.email}, phone ${v.phone}`} accent={v.whatsapp + v.email + v.phone ? 'var(--theme-success-500)' : undefined} />
        <Tile label="Website enquiries to answer" value={v.newEnquiries} sub="Quotation and verification forms" href="/admin/collections/leads?where[status][equals]=new" accent={v.newEnquiries ? 'var(--theme-warning-500)' : undefined} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
        <div style={card}>
          <strong>Page views per day</strong>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110, marginTop: 8 }}>
            {v.days.map((d) => (
              <div key={d.day} title={`${d.day}: ${d.views}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                <span style={{ fontSize: 11 }}>{d.views || ''}</span>
                <div style={{ width: '100%', height: `${Math.max(2, (d.views / max) * 80)}px`, background: 'var(--theme-success-500)', borderRadius: 3 }} />
                <span style={{ ...muted, fontSize: 11 }}>{new Date(`${d.day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        </div>
        <TopList title="Most visited pages" rows={v.topPages} empty="No visits yet" />
        <TopList title="Where visitors came from" rows={v.topSources} empty="No outside visits yet" />
      </div>
      <p style={{ ...muted, margin: '8px 0 0' }}>Counted by the website itself, without cookies or IP addresses. <a href="/admin/collections/page-views">All statistics</a></p>
    </>
  )
}

function TaskCard({ k, title, hint, tasks, open, setOpen, load }: { k: string; title: string; hint: string; tasks: Task[]; open: string | null; setOpen: (k: string | null) => void; load: () => void }) {
  const [all, setAll] = useState(false)
  return (
    <div id={`todo-${k}`} style={{ ...card, ...(URGENT.has(k) ? { borderLeft: '4px solid var(--theme-warning-500)' } : {}) }}>
      <h3 style={{ margin: '0 0 2px', fontSize: 16 }}>{title} <span style={{ ...muted, fontSize: 14 }}>({tasks.length})</span></h3>
      <p style={{ ...muted, margin: '0 0 6px' }}>{hint}</p>
      {(all ? tasks : tasks.slice(0, SHOW)).map((t, i) => {
        const key = `${k}-${i}`
        return (
          <div key={key} style={{ padding: '6px 0', borderTop: '1px solid var(--theme-elevation-100)' }}>
            <a href={t.href} style={{ fontWeight: 600 }}>{t.title}</a>
            <div style={muted}>{[t.detail, t.age != null && t.age > 0 ? `${t.age} day${t.age === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')}</div>
            {t.done ? (
              <button
                type="button"
                className="btn btn--style-secondary btn--size-small"
                style={{ margin: '4px 0 0' }}
                onClick={async () => {
                  await fetch('/api/desk/email-done/', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.done }) })
                  load()
                }}
              >
                Mark done
              </button>
            ) : null}
            {t.action ? (
              open === key ? (
                <Remind action={t.action} onDone={() => { setOpen(null); load() }} />
              ) : (
                <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: '4px 0 0' }} onClick={() => setOpen(key)}>Prepare a reminder</button>
              )
            ) : null}
          </div>
        )
      })}
      {tasks.length > SHOW ? (
        <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: '6px 0 0' }} onClick={() => setAll(!all)}>
          {all ? 'Show fewer' : `Show all ${tasks.length}`}
        </button>
      ) : null}
    </div>
  )
}

export function HomeDashboard() {
  const [data, setData] = useState<Today | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [now, setNow] = useState<Date | null>(null)
  const load = useCallback(() => {
    get('/api/desk/today').then(setData).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(() => {
    load()
    setNow(new Date())
  }, [load])

  const m = data?.money
  const owner = Boolean(m)
  const busy = data ? SECTIONS.filter(([k]) => data.tasks[k]?.length) : []
  const total = busy.reduce((a, [k]) => a + (data?.tasks[k]?.length ?? 0), 0)
  const hour = now?.getHours() ?? 12
  return (
    <div style={{ margin: '0 0 28px' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', margin: '0 0 14px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26 }}>{hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'}</h1>
          <p style={{ ...muted, margin: '2px 0 0', fontSize: 14 }}>
            {now ? now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''}
            {data ? ` · ${total ? `${total} thing${total === 1 ? '' : 's'} to do` : 'nothing waiting'}` : ''}
          </p>
        </div>
        <a href="/admin/collections/order-matches/create" className="btn btn--style-primary" style={{ margin: 0 }}>+ New customer order</a>
      </div>
      <div style={{ display: 'flex', margin: '0 0 22px' }}>
        <Search />
      </div>

      {m ? (
        <Section title="Money" hint="In US dollars. Click a figure for the accounts overview.">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
            <Tile label="Received this month" value={fmt(m.month.received)} href="/admin/globals/accounts-overview" />
            <Tile label="Paid to suppliers this month" value={fmt(m.month.paidSuppliers)} href="/admin/globals/accounts-overview" />
            <Tile label="Profit on this month's sales" value={fmt(m.month.profit)} href="/admin/globals/accounts-overview" accent="var(--theme-success-500)" />
            <Tile label="Clients owe us" value={fmt(m.all.receivable)} href="/admin/globals/accounts-overview" />
            <Tile label="We owe suppliers" value={fmt(m.all.payable)} href="/admin/globals/accounts-overview" />
          </div>
          {m.missingRates.length ? <p style={{ color: 'var(--theme-error-500)', margin: '8px 0 0' }}>No exchange rate for {m.missingRates.join(', ')}: open Company details.</p> : null}
        </Section>
      ) : null}

      <Section title="To do" hint={data && total ? 'Most urgent first. The ones with a coloured edge need action today.' : undefined}>
        {error ? <p>{error}</p> : null}
        {!data && !error ? <p style={muted}>Loading</p> : null}
        {data && total === 0 ? <p style={{ ...card, margin: 0 }}>Nothing waiting. New orders, replies and payments will appear here.</p> : null}
        {busy.length ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 10px' }}>
            {busy.map(([k, title]) => (
              <a key={k} href={`#todo-${k}`} style={{ padding: '3px 10px', borderRadius: 999, border: '1px solid var(--theme-elevation-200)', fontSize: 13, textDecoration: 'none', color: 'inherit' }}>
                {title} <strong>{data?.tasks[k].length}</strong>
              </a>
            ))}
          </div>
        ) : null}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
          {busy.map(([k, title, hint]) => <TaskCard key={k} k={k} title={title} hint={hint} tasks={data!.tasks[k]} open={open} setOpen={setOpen} load={load} />)}
        </div>
      </Section>

      <Section title="Website visitors, last 7 days">
        <WebsiteVisitors />
      </Section>

      <Section title="Shortcuts">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          {SHORTCUTS.filter(([, ownerOnly]) => !ownerOnly || owner).map(([group, , links]) => (
            <div key={group} style={card}>
              <strong>{group}</strong>
              {links.map(([label, href]) => (
                <a key={href} href={href} style={{ display: 'block', padding: '5px 0', borderTop: '1px solid var(--theme-elevation-100)', textDecoration: 'none' }}>{label}</a>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <details style={{ ...card, margin: 0 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Price history: what we were quoted, paid and sold for a material</summary>
        <div style={{ marginTop: 10 }}>
          <PriceHistory />
        </div>
      </details>
    </div>
  )
}
