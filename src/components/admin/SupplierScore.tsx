'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

// Scorecard on a supplier: how they behave with us, worked out from the enquiries and orders.
type Score = { enquiries: number; answered: number; answerRate: number | null; avgReplyDays: number | null; pricedLines: number; cheapestLines: number; cheapestRate: number | null; orders: number; certificates: { valid: number; expiring: number; expired: number } }

const tile: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 6, padding: '8px 10px', minWidth: 130 }

export function SupplierScore() {
  const { id } = useDocumentInfo()
  const [s, setS] = useState<Score | null | undefined>(undefined)
  useEffect(() => {
    if (id == null) return
    fetch(`/api/desk/scores?ids=${id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setS(j.scores?.[0] ?? null))
      .catch(() => setS(null))
  }, [id])
  if (id == null || s === undefined) return null
  const items: [string, string][] = s
    ? [
        ['Enquiries sent', String(s.enquiries)],
        ['Answered', s.answerRate == null ? 'n/a' : `${s.answerRate}%`],
        ['Average reply', s.avgReplyDays == null ? 'n/a' : `${s.avgReplyDays} days`],
        ['Cheapest on compared lines', s.cheapestRate == null ? 'n/a' : `${s.cheapestRate}%`],
        ['Purchase orders', String(s.orders)],
        ['Certificates', `${s.certificates.valid} valid, ${s.certificates.expiring} expiring, ${s.certificates.expired} expired`],
      ]
    : []
  return (
    <div style={{ margin: '0 0 18px' }}>
      <h3 style={{ margin: '0 0 8px' }}>Scorecard</h3>
      {s ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {items.map(([k, v]) => (
            <div key={k} style={tile}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>{k}</div>
              <div style={{ fontWeight: 600 }}>{v}</div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0 }}>No enquiries or orders with this supplier yet.</p>
      )}
    </div>
  )
}
