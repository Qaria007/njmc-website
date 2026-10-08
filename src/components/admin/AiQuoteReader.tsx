'use client'

import { useFormModified } from '@payloadcms/ui'
import { useState } from 'react'

// AI mode on an enquiry: paste the supplier's email or WeChat reply, let AI read it, check and
// correct the result, then save it as the supplier's quotation.
type Item = { id: string; material: string; spec?: string | null; quantity?: number | null; unit?: string | null }
type Q = {
  currency: string; incoterm: string; incotermPlace: string; validUntil: string; paymentTerms: string; contactName: string; notes: string
  items: { id: string; price: string; moq: string; leadTime: string; note: string }[]
}

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 12, margin: '12px 0 0', background: 'var(--theme-elevation-50)' }
const input: React.CSSProperties = { width: '100%', padding: '4px 6px', font: 'inherit', boxSizing: 'border-box' }
const cell: React.CSSProperties = { padding: '4px 6px', borderBottom: '1px solid var(--theme-elevation-150)', verticalAlign: 'top', textAlign: 'start' }

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `failed (${r.status})`)
  return j
}

export function AiQuoteReader({ id, onSaved }: { id: number | string; onSaved: () => Promise<void> | void }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [q, setQ] = useState<Q | null>(null)
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState('')
  const [note, setNote] = useState('')
  const [readText, setReadText] = useState('')
  const modified = useFormModified()

  const read = async () => {
    setBusy('AI is reading the reply')
    setNote('')
    try {
      const r = await post(`/api/supplier-orders/${id}/ai-read/`, { text })
      const byId = new Map((r.quote.items as Q['items']).map((i) => [i.id, i]))
      setItems(r.items)
      setReadText(r.text)
      setQ({ ...r.quote, items: (r.items as Item[]).map((i) => byId.get(i.id) ?? { id: i.id, price: '', moq: '', leadTime: '', note: '' }) })
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy('')
  }
  const save = async () => {
    if (!q) return
    setBusy('Saving')
    setNote('')
    try {
      await post(`/api/supplier-orders/${id}/apply-quote/`, { quote: q, text: readText })
      await onSaved()
      // The open form still holds the old items: reload so a later Save cannot wipe the prices.
      window.location.reload()
      return
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy('')
  }
  const setHead = (k: keyof Q, v: string) => q && setQ({ ...q, [k]: v })
  const setItem = (n: number, k: keyof Q['items'][number], v: string) => q && setQ({ ...q, items: q.items.map((i, m) => (m === n ? { ...i, [k]: v } : i)) })

  if (!open) {
    return (
      <p style={{ margin: '10px 0 0' }}>
        <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} onClick={() => setOpen(true)}>
          Read the supplier's reply with AI
        </button>
      </p>
    )
  }
  return (
    <div style={box}>
      <label style={{ display: 'block', margin: '0 0 8px' }}>
        Paste the supplier's email or WeChat reply (Chinese is fine). Empty: the reply already pasted on this enquiry is used.
        <textarea style={{ ...input, minHeight: 120 }} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <p style={{ margin: '0 0 8px', display: 'flex', gap: 10 }}>
        <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy !== ''} onClick={read}>Read with AI</button>
        <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy !== ''} onClick={() => setOpen(false)}>Close</button>
      </p>
      {busy ? <p style={{ margin: '0 0 8px' }}>{busy}, please wait</p> : null}
      {q ? (
        <>
          <p style={{ margin: '8px 0' }}><strong>Check every number against the reply, correct it here, then save.</strong> AI leaves a field empty when the reply does not say it.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, margin: '0 0 8px' }}>
            {(['currency', 'incoterm', 'incotermPlace', 'validUntil', 'paymentTerms', 'contactName'] as const).map((k) => (
              <label key={k}>
                {{ currency: 'Currency', incoterm: 'Price basis', incotermPlace: 'Port or place', validUntil: 'Valid until (YYYY-MM-DD)', paymentTerms: 'Payment terms', contactName: 'Answered by' }[k]}
                <input style={input} value={q[k]} onChange={(e) => setHead(k, e.target.value)} />
              </label>
            ))}
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>{['Item', 'Price per unit', 'Minimum order', 'Lead time', 'Note'].map((h) => <th key={h} style={{ ...cell, fontWeight: 600 }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {q.items.map((i, n) => (
                <tr key={i.id}>
                  <td style={cell}>{items[n]?.material}{items[n]?.quantity != null ? ` (${items[n].quantity} ${items[n].unit || 'kg'})` : ''}</td>
                  <td style={cell}><input style={input} value={i.price} onChange={(e) => setItem(n, 'price', e.target.value)} /></td>
                  <td style={cell}><input style={input} value={i.moq} onChange={(e) => setItem(n, 'moq', e.target.value)} /></td>
                  <td style={cell}><input style={input} value={i.leadTime} onChange={(e) => setItem(n, 'leadTime', e.target.value)} /></td>
                  <td style={cell}><input style={input} value={i.note} onChange={(e) => setItem(n, 'note', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <label style={{ display: 'block', margin: '8px 0' }}>
            Remarks
            <textarea style={{ ...input, minHeight: 60 }} value={q.notes} onChange={(e) => setHead('notes', e.target.value)} />
          </label>
          <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy !== '' || modified} onClick={save}>Save as the supplier's quotation</button>
          {modified ? <span style={{ marginInlineStart: 10 }}>Save your other changes on this page first.</span> : null}
        </>
      ) : null}
      {note ? <p style={{ margin: '8px 0 0' }}>{note}</p> : null}
    </div>
  )
}
