'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

// On a client: give the client a portal login. The client receives an email to set the password.
export function PortalInvite() {
  const { id } = useDocumentInfo()
  const clientEmail = useFormFields(([f]) => f.email?.value as string | undefined)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (id == null) return <p>Save the client first.</p>
  const invite = async () => {
    setBusy(true)
    setNote('')
    try {
      const r = await fetch(`/api/clients/${id}/portal-invite/`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email || clientEmail }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'not sent')
      setNote(`Invitation sent to ${j.email}. The client sets a password from the email, then logs in at /portal.`)
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <div style={{ border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 12, margin: '0 0 14px' }}>
      <p style={{ margin: '0 0 8px' }}>
        In the client portal the client sees their proforma invoices, invoices and packing lists, confirms a proforma invoice, sends the payment slip and follows the shipment. They never see
        other clients, suppliers or costs.
      </p>
      <p style={{ margin: 0, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder={String(clientEmail ?? 'client email')} value={email} onChange={(e) => setEmail(e.target.value)} style={{ padding: '6px 8px', font: 'inherit', minWidth: 260 }} />
        <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={invite}>Invite to the client portal</button>
      </p>
      {note ? <p style={{ margin: '8px 0 0' }}>{note}</p> : null}
    </div>
  )
}
