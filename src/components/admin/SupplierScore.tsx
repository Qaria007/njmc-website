'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

// Scorecard on a supplier: how they behave with us, worked out from the enquiries and orders.
type Score = { enquiries: number; answered: number; answerRate: number | null; avgReplyDays: number | null; pricedLines: number; cheapestLines: number; cheapestRate: number | null; orders: number; certificates: { valid: number; expiring: number; expired: number } }
type Net = { supplierId: string; network: { enquiries: number; answered: number; avgReplyDays: number | null; orders: number; problems: number }; standing: string }
const STANDING: Record<string, string> = { golden: 'Golden: answers fast, orders delivered', normal: 'Answers enquiries', new: 'No dealings yet', silent: 'Silent: no reply to 3 or more enquiries', flagged: 'Flagged: a problem was reported' }

const tile: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 6, padding: '8px 10px', minWidth: 130 }

export function SupplierScore() {
  const { id } = useDocumentInfo()
  const [s, setS] = useState<Score | null | undefined>(undefined)
  const [net, setNet] = useState<Net | null>(null)
  useEffect(() => {
    if (id == null) return
    fetch(`/api/desk/scores?ids=${id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => {
        setS(j.scores?.[0] ?? null)
        setNet(j.network?.[0] ?? null)
      })
      .catch(() => setS(null))
  }, [id])
  if (id == null || s === undefined) return null
  const n = net?.network
  const networkTiles: [string, string][] = n && (n.enquiries || n.orders || n.problems || n.answered)
    ? [['Network (other companies)', `${n.enquiries} enquiries, ${n.answered} answered${n.avgReplyDays != null ? ` in ${n.avgReplyDays} days` : ''}, ${n.orders} orders${n.problems ? `, ${n.problems} problem${n.problems === 1 ? '' : 's'}` : ''}`]]
    : []
  const standingTile: [string, string][] = net ? [['Standing', STANDING[net.standing] ?? net.standing]] : []
  const items: [string, string][] = s
    ? [
        ['Enquiries sent', String(s.enquiries)],
        ['Answered', s.answerRate == null ? 'n/a' : `${s.answerRate}%`],
        ['Average reply', s.avgReplyDays == null ? 'n/a' : `${s.avgReplyDays} days`],
        ['Cheapest on compared lines', s.cheapestRate == null ? 'n/a' : `${s.cheapestRate}%`],
        ['Purchase orders', String(s.orders)],
        ['Certificates', `${s.certificates.valid} valid, ${s.certificates.expiring} expiring, ${s.certificates.expired} expired`],
        ...networkTiles,
        ...standingTile,
      ]
    : [...networkTiles, ...standingTile]
  return (
    <div style={{ margin: '0 0 18px' }}>
      <h3 style={{ margin: '0 0 8px' }}>Scorecard</h3>
      {items.length ? (
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
