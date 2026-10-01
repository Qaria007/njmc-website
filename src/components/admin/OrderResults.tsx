'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import type { OrderTable, TableRow } from '@/lib/order-table.ts'

// Results table on the Order matching page: one row per material + supplier, with contacts.
const COLS: [keyof TableRow, string][] = [
  ['no', 'No.'],
  ['requested', 'Material requested'],
  ['quantity', 'Qty'],
  ['supplier', 'Supplier'],
  ['phone', 'Phone'],
  ['email', 'Email'],
  ['contactPerson', 'Contact'],
  ['wechat', 'WeChat'],
  ['product', 'Listed by supplier as'],
  ['match', 'Matched on'],
  ['grade', 'Grade requested'],
  ['city', 'City'],
  ['documents', 'Documents stated'],
]

const cell: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid var(--theme-elevation-150)', verticalAlign: 'top', textAlign: 'start' }

export function OrderResults() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const [table, setTable] = useState<OrderTable | null>(null)
  const [error, setError] = useState('')
  const [only, setOnly] = useState<'all' | 'found' | 'missing'>('all')

  useEffect(() => {
    if (!id) return
    let live = true
    fetch(`/api/order-matches/${id}/table/`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`could not load the results (${r.status})`))))
      .then((t) => live && setTable(t))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [id, lastUpdateTime])

  if (!id) return <p style={{ margin: '16px 0' }}>Save the order to see the suppliers table.</p>
  if (error) return <p style={{ margin: '16px 0' }}>{error}</p>
  if (!table) return <p style={{ margin: '16px 0' }}>Loading results</p>

  const rows = table.rows.filter((r) => only === 'all' || (only === 'found' ? r.found : !r.found))
  return (
    <div style={{ margin: '24px 0' }}>
      <h3 style={{ margin: '0 0 6px' }}>Suppliers for this order</h3>
      <p style={{ margin: '0 0 10px' }}>{table.summary}</p>
      <p style={{ margin: '0 0 12px', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <a className="btn btn--style-primary btn--size-small" href={`/api/order-matches/${id}/xlsx/`} style={{ margin: 0 }}>
          Download Excel
        </a>
        <select value={only} onChange={(e) => setOnly(e.target.value as typeof only)} style={{ padding: '6px 8px' }}>
          <option value="all">All materials</option>
          <option value="found">With a supplier</option>
          <option value="missing">No supplier yet</option>
        </select>
        <span style={{ opacity: 0.75 }}>
          Every supplier that lists the material is shown. DMF, CEP and GMP are often not stated in their papers: confirm with the supplier.
        </span>
      </p>
      <div style={{ overflowX: 'auto', border: '1px solid var(--theme-elevation-150)', borderRadius: 4, maxHeight: '70vh', overflowY: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 1700 }}>
          <thead>
            <tr>
              {COLS.map(([k, h]) => (
                <th key={k} style={{ ...cell, position: 'sticky', top: 0, background: 'var(--theme-elevation-100)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const first = i === 0 || rows[i - 1].no !== r.no
              return (
                <tr key={i} style={!r.found ? { background: 'var(--theme-warning-100, rgba(255, 200, 0, 0.12))' } : undefined}>
                  {COLS.map(([k]) => (
                    <td key={k} style={{ ...cell, ...(first ? { borderTop: '2px solid var(--theme-elevation-200)' } : {}) }}>
                      {['no', 'requested', 'quantity', 'grade'].includes(k) && !first ? '' : String(r[k] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
