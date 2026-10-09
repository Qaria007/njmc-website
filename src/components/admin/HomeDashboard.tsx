'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// The admin home page: search everything, quick actions, money at a glance, and the list of what
// needs doing today, with reminders that are always shown and confirmed before they are sent.
type Task = { kind: string; title: string; detail: string; href: string; age?: number; due?: string; done?: string; action?: { type: 'remind-supplier' | 'remind-client'; id: string } }
type Tasks = Record<string, Task[]>
type Totals = { received: number; paidSuppliers: number; expenses: number; cashNet: number; receivable: number; payable: number; profit: number }
type Today = { tasks: Tasks; money: { month: Totals; all: Totals; missingRates: string[] } }
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

const ACTIONS: [string, string][] = [
  ['New customer order', '/admin/collections/order-matches/create'],
  ['New client', '/admin/collections/clients/create'],
  ['Record a payment or cost', '/admin/collections/payments/create'],
  ['Upload a document', '/admin/collections/trade-files/create'],
  ['Accounts overview', '/admin/globals/accounts-overview'],
  ['Company details and AI', '/admin/globals/trade-settings'],
]

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

export function HomeDashboard() {
  const [data, setData] = useState<Today | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const load = useCallback(() => {
    get('/api/desk/today').then(setData).catch((e: Error) => setError(e.message))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const m = data?.money
  const total = data ? SECTIONS.reduce((a, [k]) => a + (data.tasks[k]?.length ?? 0), 0) : 0
  return (
    <div style={{ margin: '0 0 28px' }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', margin: '0 0 14px' }}>
        <Search />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 18px' }}>
        {ACTIONS.map(([label, href]) => (
          <a key={href} href={href} className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }}>{label}</a>
        ))}
      </div>

      {m ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '0 0 18px' }}>
          {([
            ['Received this month', m.month.received], ['Paid to suppliers this month', m.month.paidSuppliers], ['Profit on this month\'s sales', m.month.profit],
            ['Clients owe us', m.all.receivable], ['We owe suppliers', m.all.payable],
          ] as [string, number][]).map(([k, v]) => (
            <a key={k} href="/admin/globals/accounts-overview" style={{ ...card, textDecoration: 'none' }}>
              <div style={muted}>{k} (USD)</div>
              <div style={{ fontSize: 20, fontWeight: 600 }}>{fmt(v)}</div>
            </a>
          ))}
        </div>
      ) : null}
      {m?.missingRates.length ? <p style={{ color: 'var(--theme-error-500)' }}>No exchange rate for {m.missingRates.join(', ')}: open Company details.</p> : null}

      <h2 style={{ margin: '0 0 10px' }}>To do {data ? `(${total})` : ''}</h2>
      {error ? <p>{error}</p> : null}
      {data && total === 0 ? <p>Nothing waiting. New orders, replies and payments will appear here.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12, margin: '0 0 18px' }}>
        {data
          ? SECTIONS.filter(([k]) => data.tasks[k]?.length).map(([k, title, hint]) => (
              <div key={k} style={card}>
                <h3 style={{ margin: '0 0 2px' }}>{title} ({data.tasks[k].length})</h3>
                <p style={{ ...muted, margin: '0 0 8px' }}>{hint}</p>
                {data.tasks[k].slice(0, 8).map((t, i) => {
                  const key = `${k}-${i}`
                  return (
                    <div key={key} style={{ padding: '6px 0', borderTop: i ? '1px solid var(--theme-elevation-100)' : 'none' }}>
                      <a href={t.href} style={{ fontWeight: 600 }}>{t.title}</a>
                      <div style={muted}>
                        {[t.detail, t.age != null && t.age > 0 ? `${t.age} day${t.age === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ')}
                      </div>
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
                          <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: '4px 0 0' }} onClick={() => setOpen(key)}>
                            Prepare a reminder
                          </button>
                        )
                      ) : null}
                    </div>
                  )
                })}
                {data.tasks[k].length > 8 ? <p style={{ ...muted, margin: '6px 0 0' }}>and {data.tasks[k].length - 8} more</p> : null}
              </div>
            ))
          : <p>Loading</p>}
      </div>
      <PriceHistory />
    </div>
  )
}
