'use client'

import { useCallback, useEffect, useState } from 'react'

// Next steps on an Order matching page: message the suppliers found for the order (one enquiry
// each, sent only after the confirmation below) and prepare the buyer's documents.
type Existing = { id: number | string; number: string; kind: string; status: string; sentAt: string | null }
type Sup = { supplierId: string; supplier: string; emails: string[]; phone: string; wechat: string; materials: string[]; orders: Existing[] }
type Trade = { suppliers: Sup[]; buyerDocuments: { id: number | string; piNumber: string; status: string }[] }
type Result = { supplier: string; text: string; ok: boolean }

const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--theme-elevation-150)', verticalAlign: 'top', textAlign: 'start' }
const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 14, margin: '0 0 18px' }

async function call(url: string, body?: unknown) {
  const r = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (r.ok) return j
  throw new Error(j.error || `request failed (${r.status})`)
}

export function TradePanel({ id }: { id: number | string }) {
  const [trade, setTrade] = useState<Trade | null>(null)
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [error, setError] = useState('')

  const sentRfq = (s: Sup) => s.orders.find((o) => o.kind === 'rfq' && o.sentAt)
  const load = useCallback(async () => {
    try {
      const t: Trade = await call(`/api/order-matches/${id}/trade/`)
      setTrade(t)
      setPicked(new Set(t.suppliers.filter((s) => s.emails.length && s.orders.every((o) => o.kind !== 'rfq' || o.sentAt == null)).map((s) => s.supplierId)))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  if (error && trade == null) return <p style={{ margin: '16px 0' }}>{error}</p>
  if (trade == null || trade.suppliers.length === 0) return null

  const chosen = trade.suppliers.filter((s) => picked.has(s.supplierId))
  const toggle = (sid: string) => {
    const next = new Set(picked)
    if (next.has(sid)) next.delete(sid)
    else next.add(sid)
    setPicked(next)
  }

  const run = async (send: boolean) => {
    setBusy(send ? 'Sending' : 'Preparing')
    setError('')
    const out: Result[] = []
    try {
      const made: { orders: { supplierId: string; id: number | string; number: string }[] } = await call(`/api/order-matches/${id}/enquiries/`, { supplierIds: chosen.map((s) => s.supplierId) })
      for (const o of made.orders) {
        const sup = trade.suppliers.find((s) => s.supplierId === o.supplierId)
        const name = sup?.supplier ?? o.supplierId
        if (send) {
          try {
            const r = await call(`/api/supplier-orders/${o.id}/send/`, { confirm: true, again: sup != null && sentRfq(sup) != null })
            out.push({ supplier: name, ok: true, text: `${o.number} sent to ${r.to.join(', ')}${r.warning ? `. ${r.warning}` : ''}` })
          } catch (e) {
            out.push({ supplier: name, ok: false, text: `${o.number} not sent: ${(e as Error).message}` })
          }
        } else out.push({ supplier: name, ok: true, text: `${o.number} is ready as a draft` })
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setResults(out)
    setBusy('')
    setOpen(false)
    await load()
  }

  const buyerDocs = async () => {
    if (trade.buyerDocuments.length) {
      window.location.href = `/admin/collections/buyer-documents/${trade.buyerDocuments[0].id}`
      return
    }
    setBusy('Preparing')
    try {
      const made = await call(`/api/order-matches/${id}/buyer-documents/`, {})
      window.location.href = `/admin/collections/buyer-documents/${made.id}`
    } catch (e) {
      setError((e as Error).message)
      setBusy('')
    }
  }

  const all = trade.suppliers.flatMap((s) => s.orders.map((o) => ({ ...o, supplier: s.supplier })))
  return (
    <div style={box}>
      <h3 style={{ margin: '0 0 8px' }}>Next steps for this order</h3>
      <p style={{ margin: '0 0 12px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy !== ''} onClick={() => setOpen(open === false)}>
          1. Message the suppliers (ask for prices)
        </button>
        <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy !== ''} onClick={buyerDocs}>
          3. {trade.buyerDocuments.length ? 'Open' : 'Prepare'} buyer documents (PI, invoice, packing list)
        </button>
        <span style={{ opacity: 0.75 }}>2. When a supplier answers, open their enquiry below and make the purchase order from it.</span>
      </p>
      {busy ? <p style={{ margin: '0 0 10px' }}>{busy}, please wait</p> : null}
      {error ? <p style={{ margin: '0 0 10px', color: 'var(--theme-error-500)' }}>{error}</p> : null}

      {open ? (
        <div style={{ ...box, background: 'var(--theme-elevation-50)' }}>
          <p style={{ margin: '0 0 8px' }}>
            Each ticked supplier gets one email with the enquiry PDF, listing only the materials found in their catalogue. The customer name is not included. Nothing is sent
            until you press the confirm button.
          </p>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {['Send', 'Supplier', 'Email', 'Materials to ask for', 'Status'].map((h) => (
                  <th key={h} style={{ ...cell, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trade.suppliers.map((s) => {
                const sent = sentRfq(s)
                return (
                  <tr key={s.supplierId}>
                    <td style={cell}>
                      <input type="checkbox" checked={picked.has(s.supplierId)} disabled={s.emails.length === 0} onChange={() => toggle(s.supplierId)} />
                    </td>
                    <td style={cell}>{s.supplier}</td>
                    <td style={cell}>{s.emails.length ? s.emails.join(', ') : `No email on file. ${[s.phone, s.wechat].filter(Boolean).join(' / ') || 'No phone or WeChat either'}`}</td>
                    <td style={cell}>{s.materials.join('; ')}</td>
                    <td style={cell}>{sent ? `${sent.number} sent on ${String(sent.sentAt).slice(0, 10)}. Tick to send again.` : s.orders.length ? 'Draft ready' : 'Not contacted'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ margin: '12px 0 0', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy !== '' || chosen.length === 0} onClick={() => run(true)}>
              Confirm and send to {chosen.length} {chosen.length === 1 ? 'supplier' : 'suppliers'}
            </button>
            <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy !== '' || chosen.length === 0} onClick={() => run(false)}>
              Only prepare drafts (send nothing)
            </button>
            <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </p>
        </div>
      ) : null}

      {results.length ? (
        <ul style={{ margin: '0 0 10px', paddingInlineStart: 18 }}>
          {results.map((r, i) => (
            <li key={i} style={r.ok ? undefined : { color: 'var(--theme-error-500)' }}>
              {r.supplier}: {r.text}
            </li>
          ))}
        </ul>
      ) : null}

      {all.length || trade.buyerDocuments.length ? (
        <table style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <tbody>
            {all.map((o) => (
              <tr key={`s${o.id}`}>
                <td style={cell}>
                  <a href={`/admin/collections/supplier-orders/${o.id}`}>{o.number}</a>
                </td>
                <td style={cell}>{o.kind === 'po' ? 'Purchase order' : 'Enquiry'}</td>
                <td style={cell}>{o.supplier}</td>
                <td style={cell}>{o.sentAt ? `${o.status}, sent on ${String(o.sentAt).slice(0, 10)}` : o.status}</td>
              </tr>
            ))}
            {trade.buyerDocuments.map((d) => (
              <tr key={`b${d.id}`}>
                <td style={cell}>
                  <a href={`/admin/collections/buyer-documents/${d.id}`}>{d.piNumber}</a>
                </td>
                <td style={cell}>Buyer documents</td>
                <td style={cell} />
                <td style={cell}>{d.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  )
}
