'use client'

import { useCallback, useEffect, useState } from 'react'

// Accounts overview: totals for a period, who owes what, profit per sale, and the Excel download.
type Overview = {
  from: string
  to: string
  missingRates: string[]
  totals: { received: number; paidSuppliers: number; expenses: number; cashNet: number; receivable: number; payable: number; profit: number }
  sales: { id: string; number: string; invoiceNumber: string; buyer: string; date: string; status: string; totalUsd: number | null; receivedUsd: number; outstandingUsd: number | null; costUsd: number | null; costIsEstimate: boolean; expensesUsd: number; profitUsd: number | null }[]
  purchases: { id: string; number: string; supplier: string; date: string; status: string; totalUsd: number | null; paidUsd: number; owedUsd: number | null }[]
}

const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--theme-elevation-150)', verticalAlign: 'top', textAlign: 'start' }
const numCell: React.CSSProperties = { ...cell, textAlign: 'end', whiteSpace: 'nowrap' }
const tile: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: '10px 12px', minWidth: 170 }
const fmt = (n: number | null | undefined) => (n == null ? 'n/a' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const yearStart = () => `${new Date().getFullYear()}-01-01`
const today = () => new Date().toISOString().slice(0, 10)

export function AccountsPanel() {
  const [from, setFrom] = useState(yearStart())
  const [to, setTo] = useState(today())
  const [o, setO] = useState<Overview | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const r = await fetch(`/api/payments/overview?from=${from}&to=${to}`, { credentials: 'include' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'could not load')
      setO(j)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [from, to])
  useEffect(() => {
    void load()
  }, [load])

  const T = o?.totals
  return (
    <div style={{ margin: '8px 0 24px' }}>
      <p style={{ margin: '0 0 14px', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <a className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} href={`/api/payments/export?from=${from}&to=${to}`}>Download Excel for the accountant</a>
        <a className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} href="/admin/collections/payments/create">Record a payment or cost</a>
      </p>
      {error ? <p style={{ color: 'var(--theme-error-500)' }}>{error}</p> : null}
      {o && T ? (
        <>
          {o.missingRates.length ? (
            <p style={{ margin: '0 0 12px', color: 'var(--theme-error-500)' }}>
              No exchange rate for {o.missingRates.join(', ')}: those amounts are left out. Fill in the rates under Orders, Company details for documents.
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 18px' }}>
            {[
              ['Received from clients', T.received], ['Paid to suppliers', T.paidSuppliers], ['Costs', T.expenses], ['Net cash', T.cashNet],
              ['Profit on sales in the period', T.profit], ['Clients still owe us', T.receivable], ['We still owe suppliers', T.payable],
            ].map(([k, v]) => (
              <div key={k as string} style={tile}>
                <div style={{ fontSize: 12, opacity: 0.75 }}>{k} (USD)</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{fmt(v as number)}</div>
              </div>
            ))}
          </div>

          <h3 style={{ margin: '0 0 6px' }}>Sales</h3>
          {o.sales.length ? (
            <div style={{ overflowX: 'auto', margin: '0 0 18px' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>{['PI / invoice', 'Client', 'Date', 'Status', 'Total', 'Received', 'Still owed', 'Cost', 'Other costs', 'Profit'].map((h) => <th key={h} style={{ ...cell, fontWeight: 600 }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {o.sales.map((r) => (
                    <tr key={r.id}>
                      <td style={cell}><a href={`/admin/collections/buyer-documents/${r.id}`}>{r.invoiceNumber || r.number}</a></td>
                      <td style={cell}>{r.buyer}</td>
                      <td style={cell}>{r.date}</td>
                      <td style={cell}>{r.status}</td>
                      <td style={numCell}>{fmt(r.totalUsd)}</td>
                      <td style={numCell}>{fmt(r.receivedUsd)}</td>
                      <td style={{ ...numCell, fontWeight: (r.outstandingUsd ?? 0) > 0 ? 600 : 400 }}>{fmt(r.outstandingUsd)}</td>
                      <td style={numCell}>{r.costUsd == null ? 'not entered' : `${fmt(r.costUsd)}${r.costIsEstimate ? ' (from PI)' : ''}`}</td>
                      <td style={numCell}>{fmt(r.expensesUsd)}</td>
                      <td style={numCell}>{fmt(r.profitUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p style={{ margin: '0 0 18px' }}>No sales dated in this period.</p>}

          <h3 style={{ margin: '0 0 6px' }}>Purchase orders</h3>
          {o.purchases.length ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr>{['PO', 'Supplier', 'Date', 'Status', 'Total', 'Paid', 'Still owed'].map((h) => <th key={h} style={{ ...cell, fontWeight: 600 }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {o.purchases.map((r) => (
                    <tr key={r.id}>
                      <td style={cell}><a href={`/admin/collections/supplier-orders/${r.id}`}>{r.number}</a></td>
                      <td style={cell}>{r.supplier}</td>
                      <td style={cell}>{r.date}</td>
                      <td style={cell}>{r.status}</td>
                      <td style={numCell}>{fmt(r.totalUsd)}</td>
                      <td style={numCell}>{fmt(r.paidUsd)}</td>
                      <td style={{ ...numCell, fontWeight: (r.owedUsd ?? 0) > 0 ? 600 : 400 }}>{fmt(r.owedUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p>No purchase orders dated in this period.</p>}
          <p style={{ margin: '14px 0 0', opacity: 0.75 }}>
            All amounts in US dollars. Profit = sale total less the purchase orders on the same customer order (or the cost prices on the PI when there is no purchase order yet) less the costs booked on that sale. This is a management view for the business, not a tax return: give the Excel to the accountant.
          </p>
        </>
      ) : null}
    </div>
  )
}
