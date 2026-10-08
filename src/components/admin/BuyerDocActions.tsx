'use client'

import { useDocumentInfo, useFormModified } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

// The three documents printed from one buyer-documents record (PDF and Excel), what is still missing
// for each, the profit on the sale, and the send to the client (always confirmed first).
const DOCS: [Type, string][] = [
  ['pi', 'Proforma invoice'],
  ['invoice', 'Commercial invoice'],
  ['packing-list', 'Packing list'],
]
type Type = 'pi' | 'invoice' | 'packing-list'
type Check = {
  gaps: Record<Type, string[]>
  messages: Record<Type, { subject: string; body: string }>
  to: string[]
  copyTo: string[]
  you: string
  margin: { sales: number; cost: number | null; profit: number | null; percent: number | null; missingCost: number }
  currency: string
  sendLog: string
}

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 14, margin: '0 0 18px' }
const input: React.CSSProperties = { width: '100%', padding: '6px 8px', font: 'inherit', boxSizing: 'border-box' }
const fmt = (n: number | null) => (n == null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const STOP = /^(no items|a price or quantity|bank details|the invoice date|some text)/

export function BuyerDocActions() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const modified = useFormModified()
  const [check, setCheck] = useState<Check | null>(null)
  const [sending, setSending] = useState<Type | null>(null)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [excel, setExcel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (id == null) return
    const r = await fetch(`/api/buyer-documents/${id}/check/`, { credentials: 'include' })
    if (r.ok) setCheck(await r.json())
  }, [id])
  useEffect(() => {
    void load()
  }, [load, lastUpdateTime])

  if (id == null) return <p style={{ margin: '16px 0' }}>Choose the client (or type the buyer), add the items and save. The documents appear here.</p>

  const open = (type: Type) => {
    if (!check) return
    setSending(type)
    setSubject(check.messages[type].subject)
    setMessage(check.messages[type].body)
    setNote('')
    setError('')
  }
  const send = async (test: boolean) => {
    if (!sending) return
    setBusy(true)
    setError('')
    setNote('')
    try {
      const r = await fetch(`/api/buyer-documents/${id}/send/`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: sending, subject, message, excel, ...(test ? { test: true } : { confirm: true }) }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'not sent')
      setNote(test ? `Test sent to ${j.to.join(', ')}. The client received nothing.` : `Sent to ${j.to.join(', ')}. ${j.warning ?? ''}`)
      if (!test) setSending(null)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  const m = check?.margin
  const stop = sending && check ? check.gaps[sending].filter((g) => STOP.test(g)) : []
  return (
    <div style={box}>
      {modified ? <p style={{ margin: '0 0 10px' }}>You have changes that are not saved. Save first: the documents use the saved version.</p> : null}
      <table style={{ borderCollapse: 'collapse', fontSize: 13, margin: '0 0 8px' }}>
        <tbody>
          {DOCS.map(([type, label]) => (
            <tr key={type}>
              <td style={{ padding: '4px 12px 4px 0', fontWeight: 600 }}>{label}</td>
              <td style={{ padding: '4px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <a className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} href={`/api/buyer-documents/${id}/pdf/${type}/`} target="_blank" rel="noreferrer">PDF</a>
                <a className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} href={`/api/buyer-documents/${id}/xlsx/${type}/`}>Excel</a>
                <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={modified || busy || check == null} onClick={() => open(type)}>
                  Send to the client
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {check
        ? DOCS.filter(([type]) => check.gaps[type]?.length).map(([type, label]) => (
            <p key={type} style={{ margin: '4px 0 0' }}>
              {label}, still missing: {check.gaps[type].join('; ')}.
            </p>
          ))
        : null}
      {m && m.sales ? (
        <p style={{ margin: '10px 0 0' }}>
          <strong>Profit (internal):</strong> sales {check?.currency} {fmt(m.sales)}
          {m.cost != null ? `, cost ${fmt(m.cost)}, profit ${fmt(m.profit)}${m.percent != null ? ` (${m.percent}% on cost)` : ''}` : ', no cost entered on the items'}
          {m.missingCost && m.cost != null ? `. ${m.missingCost} item(s) have no cost yet.` : '.'}
        </p>
      ) : null}

      {sending && check ? (
        <div style={{ ...box, margin: '14px 0 0', background: 'var(--theme-elevation-50)' }}>
          <p style={{ margin: '0 0 8px' }}>
            {DOCS.find(([t]) => t === sending)?.[1]} as PDF{excel ? ' and Excel' : ''} to:{' '}
            <strong>{check.to.length ? check.to.join(', ') : 'no email yet: fill in "Send documents to" and save'}</strong>
            {check.copyTo.length ? ` (copy to ${check.copyTo.join(', ')})` : ''}.
          </p>
          <label style={{ display: 'block', margin: '0 0 6px' }}>
            Subject
            <input style={input} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label style={{ display: 'block', margin: '0 0 6px' }}>
            Message
            <textarea style={{ ...input, minHeight: 200 }} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          <label style={{ display: 'block', margin: '0 0 10px' }}>
            <input type="checkbox" checked={excel} onChange={(e) => setExcel(e.target.checked)} /> Attach the Excel file as well
          </label>
          {stop.length ? <p style={{ margin: '0 0 10px', color: 'var(--theme-error-500)' }}>Cannot send yet: {stop.join('; ')}.</p> : null}
          <p style={{ margin: 0, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy || !check.to.length || stop.length > 0} onClick={() => send(false)}>
              Confirm and send to the client
            </button>
            <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={() => send(true)}>
              Send a test to myself{check.you ? ` (${check.you})` : ''}
            </button>
            <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={() => setSending(null)}>
              Cancel
            </button>
          </p>
        </div>
      ) : null}
      {note ? <p style={{ margin: '10px 0 0' }}>{note}</p> : null}
      {error ? <p style={{ margin: '10px 0 0', color: 'var(--theme-error-500)' }}>{error}</p> : null}
      <p style={{ margin: '10px 0 0', opacity: 0.75 }}>
        The PDF and the Excel are made from this record, so they always match. The company name, logo and bank details come from Orders, Company details for documents.
      </p>
    </div>
  )
}
