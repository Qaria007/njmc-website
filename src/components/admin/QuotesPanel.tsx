'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// Step 2 on an order: every price the suppliers sent, per line, cheapest first. Pick one price per
// line, set the margin, and make the proforma invoice from them.
type Option = {
  rfqId: number | string; rfqNumber: string; itemId: string; supplier: string; material: string; spec: string; quantity: number | null; unit: string
  price: number; currency: string; priceBasis: string; converted: number | null; moq: string; leadTime: string; note: string; validUntil: string; expired: boolean
}
type Line = { requested: string; quantity: string; options: Option[] }
type Data = { currency: string; defaultMargin: number | null; rates: { cnyPerUsd?: number | null; usdPerEur?: number | null }; enquiries: { id: number | string; number: string; supplier: string; status: string; answered: string }[]; lines: Line[] }

const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--theme-elevation-150)', verticalAlign: 'top', textAlign: 'start' }
const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 14, margin: '0 0 18px' }
const num: React.CSSProperties = { width: 70, padding: '3px 6px' }
const fmt = (n: number | null | undefined) => (n == null ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }))
const sell = (cost: number, m: number) => Math.round((cost * (1 + m / 100) + Number.EPSILON) * 100) / 100

export function QuotesPanel({ id }: { id: number | string }) {
  const [currency, setCurrency] = useState('USD')
  const [data, setData] = useState<Data | null>(null)
  const [pick, setPick] = useState<Record<number, string>>({})
  const [margin, setMargin] = useState<Record<number, string>>({})
  const [all, setAll] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/order-matches/${id}/quotes/?currency=${currency}`, { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'could not load the prices')
      setData(j)
      // Cheapest valid price preselected on each line.
      const p: Record<number, string> = {}
      ;(j as Data).lines.forEach((l, k) => {
        const best = l.options.find((o) => !o.expired && o.converted != null) ?? l.options[0]
        if (best) p[k] = `${best.rfqId}:${best.itemId}`
      })
      setPick(p)
      setAll((v) => v || (j.defaultMargin != null ? String(j.defaultMargin) : ''))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id, currency])
  useEffect(() => {
    void load()
  }, [load])

  const priced = useMemo(() => (data?.lines ?? []).map((l, k) => ({ l, k })).filter(({ l }) => l.options.length), [data])
  if (data == null) return error ? <p style={{ margin: '0 0 16px' }}>{error}</p> : null
  const answered = data.enquiries.filter((e) => e.answered)
  if (!data.enquiries.length) return null

  const marginOf = (k: number) => (margin[k] ?? all).trim()
  const chosen = priced.filter(({ k }) => pick[k] && pick[k] !== 'skip')
  const missingRate = chosen.some(({ l, k }) => l.options.find((o) => `${o.rfqId}:${o.itemId}` === pick[k])?.converted == null)
  const badMargin = chosen.some(({ k }) => marginOf(k) === '' || !(Number(marginOf(k)) >= 0))

  const make = async () => {
    setBusy(true)
    setError('')
    try {
      const lines = chosen.map(({ l, k }) => {
        const [rfqId, itemId] = pick[k].split(':')
        return { rfqId, itemId, margin: Number(marginOf(k)), requested: l.requested }
      })
      const r = await fetch(`/api/order-matches/${id}/make-pi/`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currency, lines }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'not made')
      window.location.href = `/admin/collections/buyer-documents/${j.id}`
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div style={box}>
      <h3 style={{ margin: '0 0 6px' }}>2. Supplier prices and the proforma invoice</h3>
      <p style={{ margin: '0 0 10px' }}>
        {answered.length} of {data.enquiries.length} suppliers have sent prices
        {answered.length ? ` (${answered.map((e) => e.supplier).join(', ')})` : ''}. Prices typed into an enquiry by hand show here too.
      </p>
      <p style={{ margin: '0 0 12px', display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>
          PI currency{' '}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['USD', 'EUR', 'CNY'].map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Markup on cost, all items (%) <input style={num} inputMode="decimal" value={all} onChange={(e) => setAll(e.target.value)} />
        </label>
        <span style={{ opacity: 0.75 }}>
          Rates: {data.rates.cnyPerUsd ? `1 USD = ${data.rates.cnyPerUsd} CNY` : 'CNY rate not set'}; {data.rates.usdPerEur ? `1 EUR = ${data.rates.usdPerEur} USD` : 'EUR rate not set'} (Company details for documents)
        </span>
      </p>
      {priced.length === 0 ? (
        <p style={{ margin: 0 }}>No prices yet. They appear here as soon as a supplier answers through the link in the enquiry, or when you type them into the enquiry.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>
                {['Requested', 'Choose a price', 'Markup %', `Selling price (${currency})`].map((h) => (
                  <th key={h} style={{ ...cell, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {priced.map(({ l, k }) => {
                const o = l.options.find((x) => `${x.rfqId}:${x.itemId}` === pick[k])
                const m = Number(marginOf(k))
                return (
                  <tr key={k}>
                    <td style={cell}>
                      <strong>{l.requested}</strong>
                      {l.quantity ? <div style={{ opacity: 0.75 }}>{l.quantity}</div> : null}
                    </td>
                    <td style={cell}>
                      {l.options.map((x, n) => {
                        const v = `${x.rfqId}:${x.itemId}`
                        return (
                          <label key={v} style={{ display: 'block', margin: '0 0 4px', opacity: x.expired ? 0.6 : 1 }}>
                            <input type="radio" name={`line${k}`} checked={pick[k] === v} onChange={() => setPick({ ...pick, [k]: v })} />{' '}
                            {n === 0 ? <strong>{x.supplier}</strong> : x.supplier}: {x.currency} {fmt(x.price)}/{x.unit}
                            {x.currency !== currency ? (x.converted == null ? ' (no rate)' : ` = ${currency} ${fmt(x.converted)}`) : ''}
                            {[x.priceBasis, x.moq && `MOQ ${x.moq}`, x.leadTime && `lead time ${x.leadTime}`, x.validUntil && `valid to ${x.validUntil}${x.expired ? ' (EXPIRED)' : ''}`, x.note]
                              .filter(Boolean)
                              .map((t) => `, ${t}`)
                              .join('')}{' '}
                            <a href={`/admin/collections/supplier-orders/${x.rfqId}`} style={{ opacity: 0.7 }}>{x.rfqNumber}</a>
                          </label>
                        )
                      })}
                      <label style={{ display: 'block', opacity: 0.75 }}>
                        <input type="radio" name={`line${k}`} checked={pick[k] === 'skip'} onChange={() => setPick({ ...pick, [k]: 'skip' })} /> Leave this line out of the PI
                      </label>
                    </td>
                    <td style={cell}>
                      <input style={num} inputMode="decimal" value={margin[k] ?? ''} placeholder={all} onChange={(e) => setMargin({ ...margin, [k]: e.target.value })} />
                    </td>
                    <td style={cell}>{o && o.converted != null && pick[k] !== 'skip' && marginOf(k) !== '' && m >= 0 ? `${currency} ${fmt(sell(o.converted, m))}/${o.unit}` : ''}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {priced.length ? (
        <p style={{ margin: '12px 0 0', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy || !chosen.length || missingRate || badMargin} onClick={make}>
            Make the proforma invoice from {chosen.length} {chosen.length === 1 ? 'price' : 'prices'}
          </button>
          {missingRate ? <span>A chosen price is in another currency and the exchange rate is not set.</span> : null}
          {!missingRate && badMargin ? <span>Enter the markup.</span> : null}
          <span style={{ opacity: 0.75 }}>It opens as a draft: check it, then send it to the client from there. Supplier names and costs are never printed.</span>
        </p>
      ) : null}
      {error ? <p style={{ margin: '10px 0 0', color: 'var(--theme-error-500)' }}>{error}</p> : null}
    </div>
  )
}
