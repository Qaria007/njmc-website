'use client'

import { useCallback, useEffect, useState } from 'react'

// The client portal: log in, see own sales, open documents, confirm a proforma invoice, send a
// payment slip, follow the shipment. Talks only to /api/portal-users (login) and /api/portal/*.
type Sale = {
  id: number; number: string; invoiceNumber: string; date: string; status: string; currency: string; total: number; paid: number; validity: string; paymentTerms: string
  items: { description: string; quantity: number | null; unit: string }[]
  shipment: { ready: string; etd: string; eta: string; forwarder: string; bl: string; vessel: string; documents: string[] }
  docs: ('pi' | 'invoice' | 'packing-list')[]; canConfirm: boolean
}

const input: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #b9c0cc', borderRadius: 4, font: 'inherit', boxSizing: 'border-box' }
const card: React.CSSProperties = { border: '1px solid #d9dde4', borderRadius: 8, padding: 16, margin: '0 0 16px' }
const DOC_LABEL = { pi: 'Proforma invoice', invoice: 'Commercial invoice', 'packing-list': 'Packing list' }
const STATUS: Record<string, string> = {
  'PI sent': 'Waiting for your confirmation', confirmed: 'Confirmed, waiting for payment', paid: 'Paid', 'in production': 'In preparation', shipped: 'Shipped', delivered: 'Delivered', closed: 'Closed', cancelled: 'Cancelled',
}
const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, { credentials: 'include', ...init })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw Object.assign(new Error(j.error || j.errors?.[0]?.message || 'Something went wrong'), { status: r.status })
  return j
}

function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [forgot, setForgot] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await json('/api/portal-users/login/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })
      onIn()
    } catch {
      setError('The email or password is not right.')
    }
  }
  const reset = async () => {
    if (!email) return setForgot('Type your email first.')
    await json('/api/portal-users/forgot-password/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) }).catch(() => undefined)
    setForgot('If this email has a portal login, a link to set a new password is on its way.')
  }
  return (
    <form onSubmit={submit} style={{ ...card, maxWidth: 420 }}>
      <h2 style={{ marginTop: 0 }}>Log in</h2>
      <label style={{ display: 'block', margin: '0 0 10px' }}>Email<input style={input} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label style={{ display: 'block', margin: '0 0 14px' }}>Password<input style={input} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      {error ? <p style={{ color: '#b42318' }}>{error}</p> : null}
      <button type="submit" className="btn btn-primary">Log in</button>{' '}
      <button type="button" onClick={reset} style={{ background: 'none', border: 0, textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Forgot password</button>
      {forgot ? <p>{forgot}</p> : null}
      <p style={{ opacity: 0.75, marginBottom: 0 }}>No login yet? Ask your contact at our company for an invitation.</p>
    </form>
  )
}

function SaleCard({ s, reload }: { s: Sale; reload: () => void }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    if (!window.confirm(`Confirm the proforma invoice ${s.number}?`)) return
    setBusy(true)
    try {
      await json('/api/portal/confirm/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: s.id }) })
      reload()
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }
  const slip = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setNote('Sending')
    const form = new FormData()
    form.append('id', String(s.id))
    form.append('file', file)
    try {
      await json('/api/portal/slip/', { method: 'POST', body: form })
      setNote('Thank you, the payment slip was received. We will confirm when the payment arrives.')
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }
  const sh = s.shipment
  const ship = [sh.ready && `Goods ready ${sh.ready}`, sh.etd && `Departure ${sh.etd}`, sh.eta && `Arrival ${sh.eta}`, sh.forwarder && `Forwarder: ${sh.forwarder}`, sh.vessel && `Vessel / flight: ${sh.vessel}`, sh.bl && `B/L or AWB: ${sh.bl}`].filter(Boolean)
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <h3 style={{ margin: 0 }}>{s.invoiceNumber || s.number}</h3>
        <strong>{STATUS[s.status] ?? s.status}</strong>
      </div>
      <p style={{ margin: '4px 0 10px', opacity: 0.8 }}>
        {s.date}. Total {s.currency} {money(s.total)}{s.paid ? `, paid ${s.currency} ${money(s.paid)}` : ''}{s.paymentTerms ? `. Payment: ${s.paymentTerms}` : ''}
      </p>
      <p style={{ margin: '0 0 10px' }}>{s.items.map((i) => `${i.description}${i.quantity != null ? ` (${i.quantity} ${i.unit || 'kg'})` : ''}`).join(', ')}</p>
      <p style={{ margin: '0 0 10px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {s.docs.map((d) => (
          <a key={d} className="btn btn-outline" style={{ color: 'inherit', borderColor: '#b9c0cc' }} href={`/api/portal/pdf?id=${s.id}&type=${d}`} target="_blank" rel="noreferrer">{DOC_LABEL[d]} (PDF)</a>
        ))}
      </p>
      {s.canConfirm ? (
        <p style={{ margin: '0 0 10px' }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={confirm}>Confirm this proforma invoice</button>
          {s.validity ? <span style={{ marginInlineStart: 10, opacity: 0.75 }}>Valid until {s.validity}</span> : null}
        </p>
      ) : null}
      {s.status !== 'cancelled' && s.status !== 'closed' ? (
        <label style={{ display: 'block', margin: '0 0 10px' }}>
          Send a payment slip (PDF or photo):{' '}
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={(e) => slip(e.target.files?.[0])} />
        </label>
      ) : null}
      {ship.length ? <p style={{ margin: '0 0 6px' }}><strong>Shipment:</strong> {ship.join('. ')}</p> : null}
      {sh.documents.length ? <p style={{ margin: 0 }}><strong>Documents sent to you:</strong> {sh.documents.join(', ')}</p> : null}
      {note ? <p style={{ margin: '8px 0 0' }}>{note}</p> : null}
    </div>
  )
}

export function ClientPortal() {
  const [state, setState] = useState<'loading' | 'out' | 'in'>('loading')
  const [data, setData] = useState<{ client: string; sales: Sale[] } | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await json('/api/portal/sales/'))
      setState('in')
    } catch {
      setState('out')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  const logout = async () => {
    await fetch('/api/portal-users/logout/', { method: 'POST', credentials: 'include' }).catch(() => undefined)
    setState('out')
  }
  if (state === 'loading') return <p>Loading</p>
  if (state === 'out') return <Login onIn={load} />
  return (
    <div>
      <p style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span>Welcome, {data?.client}.</span>
        <button type="button" onClick={logout} style={{ background: 'none', border: 0, textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Log out</button>
      </p>
      {data?.sales.length ? data.sales.map((s) => <SaleCard key={s.id} s={s} reload={load} />) : <p>No documents yet. They appear here as soon as we send you a proforma invoice.</p>}
    </div>
  )
}

export function PortalReset() {
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [note, setNote] = useState('')
  const [done, setDone] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 10) return setNote('Use at least 10 characters.')
    if (password !== again) return setNote('The two passwords are not the same.')
    const token = new URLSearchParams(window.location.search).get('token') ?? ''
    try {
      await json('/api/portal-users/reset-password/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password }) })
      setDone(true)
    } catch {
      setNote('This link is no longer valid. Ask for a new one from the login page.')
    }
  }
  if (done) return <p>Your password is set. <a href="/portal/">Go to the client portal</a>.</p>
  return (
    <form onSubmit={submit} style={card}>
      <label style={{ display: 'block', margin: '0 0 10px' }}>New password<input style={input} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <label style={{ display: 'block', margin: '0 0 14px' }}>The same again<input style={input} type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} /></label>
      {note ? <p style={{ color: '#b42318' }}>{note}</p> : null}
      <button type="submit" className="btn btn-primary">Set my password</button>
    </form>
  )
}
