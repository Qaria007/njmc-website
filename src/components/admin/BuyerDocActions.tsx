'use client'

import { useDocumentInfo, useFormModified } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

// The three PDFs printed from one buyer-documents record, with what is still missing for each.
const DOCS: [string, string][] = [
  ['pi', 'Proforma invoice'],
  ['invoice', 'Commercial invoice'],
  ['packing-list', 'Packing list'],
]

export function BuyerDocActions() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const modified = useFormModified()
  const [gaps, setGaps] = useState<Record<string, string[]>>({})

  useEffect(() => {
    if (id == null) return
    let live = true
    fetch(`/api/buyer-documents/${id}/check/`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { gaps: {} }))
      .then((j) => live && setGaps(j.gaps ?? {}))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id, lastUpdateTime])

  if (id == null) return <p style={{ margin: '16px 0' }}>Fill in the buyer and the items, then save. The three PDFs appear here.</p>
  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 14, margin: '0 0 18px' }}>
      {modified ? <p style={{ margin: '0 0 10px' }}>You have changes that are not saved. Save first: the PDFs use the saved version.</p> : null}
      <p style={{ margin: '0 0 8px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {DOCS.map(([type, label]) => (
          <a key={type} className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} href={`/api/buyer-documents/${id}/pdf/${type}/`} target="_blank" rel="noreferrer">
            {label} (PDF)
          </a>
        ))}
      </p>
      {DOCS.filter(([type]) => gaps[type]?.length).map(([type, label]) => (
        <p key={type} style={{ margin: '4px 0 0' }}>
          {label}, still missing: {gaps[type].join('; ')}.
        </p>
      ))}
      <p style={{ margin: '8px 0 0', opacity: 0.75 }}>The company name, address and bank details come from Orders, Company details for documents.</p>
    </div>
  )
}
