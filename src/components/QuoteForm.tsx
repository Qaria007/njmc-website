'use client'

import { useState } from 'react'

type Item = { id: string; material: string; spec: string; quantity: string; unit: string; price: string; moq: string; leadTime: string; note: string }
type Head = { currency: string; incoterm: string; incotermPlace: string; validUntil: string; paymentTerms: string; contactName: string; notes: string }

const input: React.CSSProperties = { width: '100%', padding: '6px 8px', border: '1px solid #b9c0cc', borderRadius: 4, font: 'inherit', boxSizing: 'border-box' }
const label: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 600, margin: '0 0 4px' }

// The supplier's side of an enquiry: one price per item plus the terms. Sent as JSON to our API.
export function QuoteForm({ token, items: start, currencies, incoterms, initial, answered }: {
  token: string; items: Item[]; currencies: string[]; incoterms: string[]; initial: Head; answered: string
}) {
  const [items, setItems] = useState(start)
  const [head, setHead] = useState(initial)
  const [state, setState] = useState<'' | 'sending' | 'sent'>('')
  const [error, setError] = useState('')

  const setItem = (k: number, f: keyof Item, v: string) => setItems(items.map((i, n) => (n === k ? { ...i, [f]: v } : i)))
  const setH = (f: keyof Head, v: string) => setHead({ ...head, [f]: v })

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    setState('sending')
    setError('')
    try {
      const r = await fetch('/api/supplier-orders/public-quote/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...head, items: items.map((i) => ({ id: i.id, price: i.price, moq: i.moq, leadTime: i.leadTime, note: i.note })) }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Not sent, please try again')
      setState('sent')
    } catch (err) {
      setError((err as Error).message)
      setState('')
    }
  }

  if (state === 'sent') {
    return (
      <div style={{ border: '1px solid #b9c0cc', borderRadius: 6, padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Thank you, your prices were received</h2>
        <p style={{ marginBottom: 0 }}>We will come back to you. To change a price, open the same link again.</p>
      </div>
    )
  }

  return (
    <form onSubmit={send}>
      {answered ? <p style={{ margin: '0 0 14px' }}>You answered on {answered}. Sending again replaces your earlier prices.</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, margin: '0 0 18px' }}>
        <div>
          <label style={label} htmlFor="q-cur">Currency</label>
          <select id="q-cur" style={input} value={head.currency} onChange={(e) => setH('currency', e.target.value)}>
            {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="q-inc">Price basis</label>
          <select id="q-inc" style={input} value={head.incoterm} onChange={(e) => setH('incoterm', e.target.value)}>
            <option value="">Choose</option>
            {incoterms.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={label} htmlFor="q-place">Port or place</label>
          <input id="q-place" style={input} value={head.incotermPlace} onChange={(e) => setH('incotermPlace', e.target.value)} placeholder="e.g. Shanghai" maxLength={80} />
        </div>
        <div>
          <label style={label} htmlFor="q-valid">Prices valid until</label>
          <input id="q-valid" type="date" style={input} value={head.validUntil} onChange={(e) => setH('validUntil', e.target.value)} />
        </div>
      </div>

      <div style={{ margin: '0 0 18px' }}>
        {items.map((i, k) => (
          <fieldset key={i.id} style={{ border: '1px solid #d9dde4', borderRadius: 6, padding: '12px 14px', margin: '0 0 12px' }}>
            <legend style={{ padding: '0 6px', fontWeight: 600 }}>
              {k + 1}. {i.material}
              {[i.quantity, i.unit].filter(Boolean).length ? `, ${[i.quantity, i.unit].filter(Boolean).join(' ')}` : ''}
            </legend>
            {i.spec ? <p style={{ margin: '0 0 8px', opacity: 0.75 }}>{i.spec}</p> : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <div>
                <label style={label} htmlFor={`p${k}`}>Price per {i.unit || 'unit'} ({head.currency})</label>
                <input id={`p${k}`} style={input} inputMode="decimal" value={i.price} onChange={(e) => setItem(k, 'price', e.target.value)} />
              </div>
              <div>
                <label style={label} htmlFor={`m${k}`}>Minimum order</label>
                <input id={`m${k}`} style={input} value={i.moq} onChange={(e) => setItem(k, 'moq', e.target.value)} maxLength={80} />
              </div>
              <div>
                <label style={label} htmlFor={`l${k}`}>Lead time</label>
                <input id={`l${k}`} style={input} value={i.leadTime} onChange={(e) => setItem(k, 'leadTime', e.target.value)} placeholder="e.g. 15 days" maxLength={80} />
              </div>
              <div>
                <label style={label} htmlFor={`n${k}`}>Note</label>
                <input id={`n${k}`} style={input} value={i.note} onChange={(e) => setItem(k, 'note', e.target.value)} placeholder="grade, packing, DMF" maxLength={300} />
              </div>
            </div>
          </fieldset>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, margin: '0 0 14px' }}>
        <div>
          <label style={label} htmlFor="q-pay">Payment terms</label>
          <input id="q-pay" style={input} value={head.paymentTerms} onChange={(e) => setH('paymentTerms', e.target.value)} placeholder="e.g. 30% T/T in advance, 70% before shipment" maxLength={200} />
        </div>
        <div>
          <label style={label} htmlFor="q-name">Your name</label>
          <input id="q-name" style={input} value={head.contactName} onChange={(e) => setH('contactName', e.target.value)} maxLength={120} />
        </div>
      </div>
      <div style={{ margin: '0 0 18px' }}>
        <label style={label} htmlFor="q-notes">Remarks</label>
        <textarea id="q-notes" style={{ ...input, minHeight: 90 }} value={head.notes} onChange={(e) => setH('notes', e.target.value)} maxLength={2000} placeholder="Packing, documents available (GMP, DMF, CEP), anything else" />
      </div>
      {error ? <p style={{ color: '#b42318', margin: '0 0 12px' }}>{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending' : 'Send my prices'}
      </button>
    </form>
  )
}
