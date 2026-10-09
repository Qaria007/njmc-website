'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'

// On a certificate of analysis: download it and open PharmaTrust to check it, then note the result below.
export function PharmaTrustCheck() {
  const { id } = useDocumentInfo()
  const filename = useFormFields(([f]) => f.filename?.value as string | undefined)
  if (id == null || !filename) return <p style={{ margin: '0 0 12px' }}>Upload the certificate first.</p>
  const file = `/api/trade-files/file/${encodeURIComponent(filename)}`
  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 12, margin: '0 0 12px' }}>
      <p style={{ margin: '0 0 8px' }}>
        1. Download the certificate. 2. Open PharmaTrust and upload it there. 3. Write the result below and save: the dashboard keeps reminding you until it is checked.
      </p>
      <p style={{ margin: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} href={file} download>Download the certificate</a>
        <a className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} href="https://pharmatrust.tech/coa-check" target="_blank" rel="noreferrer">Open PharmaTrust</a>
      </p>
    </div>
  )
}
