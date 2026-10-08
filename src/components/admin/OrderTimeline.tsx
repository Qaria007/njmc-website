'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

// Everything that happened on this customer order, oldest first, each line linking to its record.
type Ev = { date: string; text: string; href: string }

export function OrderTimeline() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const [events, setEvents] = useState<Ev[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (id == null) return
    fetch(`/api/desk/order-timeline?id=${id}`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j) => setEvents(j.events ?? []))
      .catch(() => setEvents([]))
  }, [id, lastUpdateTime])
  if (id == null || events.length < 2) return null
  const shown = open ? events : events.slice(-5)
  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 6, padding: 14, margin: '0 0 18px' }}>
      <h3 style={{ margin: '0 0 8px' }}>Order history ({events.length})</h3>
      {!open && events.length > 5 ? (
        <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: '0 0 6px' }} onClick={() => setOpen(true)}>Show all {events.length}</button>
      ) : null}
      <ol style={{ margin: 0, paddingInlineStart: 18 }}>
        {shown.map((e, i) => (
          <li key={i} style={{ margin: '0 0 4px' }}>
            <span style={{ opacity: 0.7 }}>{e.date.slice(0, 10)}</span> <a href={e.href}>{e.text}</a>
          </li>
        ))}
      </ol>
    </div>
  )
}
