'use client'

import { useDocumentInfo, useFormModified } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

// Buttons on a supplier enquiry or purchase order: the PDF, a test email to yourself, and the
// send to the supplier, which always shows who gets it and asks for a confirmation first.
type Check = {
  number: string; kind: 'rfq' | 'po'; status: string; supplier: string; to: string[]; copyTo: string[]; gaps: string[]; subject: string; message: string
  sentAt: string | null; phone: string; wechat: string; you: string; quoteLink: string; quoteReceivedAt: string | null
}

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 14, margin: '0 0 18px' }

async function call(url: string, body?: unknown) {
  const r = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (r.ok) return j
  throw new Error(j.error || `request failed (${r.status})`)
}

export function SupplierOrderActions() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const modified = useFormModified()
  const [check, setCheck] = useState<Check | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (id == null) return
    try {
      setCheck(await call(`/api/supplier-orders/${id}/check/`))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load, lastUpdateTime])

  if (id == null) return <p style={{ margin: '16px 0' }}>Choose the supplier, add the items and save. The PDF and the send button appear here.</p>
  if (check == null) return <p style={{ margin: '16px 0' }}>{error || 'Loading'}</p>

  const what = check.kind === 'po' ? 'purchase order' : 'enquiry'
  const act = async (body: unknown, done: (r: { to: string[]; warning?: string }) => string) => {
    setBusy(true)
    setError('')
    setNote('')
    try {
      setNote(done(await call(`/api/supplier-orders/${id}/send/`, body)))
      setConfirming(false)
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }
  const makePo = async () => {
    setBusy(true)
    try {
      const made = await call(`/api/supplier-orders/${id}/to-po/`, {})
      window.location.href = `/admin/collections/supplier-orders/${made.id}`
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  const stop = check.gaps.filter((g) => /^(no items|no email|a price|a quantity)/.test(g))

  return (
    <div style={box}>
      <p style={{ margin: '0 0 10px' }}>
        <strong>{check.number}</strong>: {what} for {check.supplier}. {check.sentAt ? `Sent on ${String(check.sentAt).slice(0, 10)}.` : 'Not sent yet.'}
      </p>
      {modified ? <p style={{ margin: '0 0 10px' }}>You have changes that are not saved. Save first: the PDF and the email use the saved version.</p> : null}
      {check.gaps.length ? <p style={{ margin: '0 0 10px' }}>Still missing: {check.gaps.join('; ')}.</p> : null}
      <p style={{ margin: 0, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <a className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} href={`/api/supplier-orders/${id}/pdf/`} target="_blank" rel="noreferrer">
          Open the PDF
        </a>
        <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy || modified} onClick={() => act({ test: true }, (r) => `Test sent to ${r.to.join(', ')}. The supplier received nothing.`)}>
          Send a test to myself
        </button>
        <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy || modified || stop.length > 0 || check.status === 'cancelled'} onClick={() => setConfirming(true)}>
          Send to the supplier
        </button>
        {check.kind === 'rfq' ? (
          <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy || modified} onClick={makePo}>
            Make a purchase order from this enquiry
          </button>
        ) : null}
      </p>
      {check.kind === 'rfq' && check.quoteLink ? (
        <p style={{ margin: '10px 0 0' }}>
          {check.quoteReceivedAt ? `Prices received on ${String(check.quoteReceivedAt).slice(0, 10)} (see "The supplier's quotation" below). ` : 'No prices yet. '}
          The supplier's price page (it is in the email; you can also send it by WeChat):{' '}
          <a href={check.quoteLink} target="_blank" rel="noreferrer">{check.quoteLink}</a>{' '}
          <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} onClick={() => void navigator.clipboard?.writeText(check.quoteLink)}>
            Copy link
          </button>
        </p>
      ) : null}
      {check.to.length === 0 ? (
        <p style={{ margin: '10px 0 0' }}>
          No email for this supplier. Open the PDF and send it yourself by WeChat or phone: {[check.phone, check.wechat].filter(Boolean).join(' / ') || 'no phone or WeChat on file'}.
        </p>
      ) : null}
      {confirming ? (
        <div style={{ ...box, margin: '14px 0 0', background: 'var(--theme-elevation-50)' }}>
          <p style={{ margin: '0 0 6px' }}>
            This sends the {what} <strong>{check.number}</strong> with its PDF to: <strong>{check.to.join(', ')}</strong>
            {check.copyTo.length ? ` (copy to ${check.copyTo.join(', ')})` : ''}.
          </p>
          <p style={{ margin: '0 0 6px' }}>Subject: {check.subject}</p>
          <pre style={{ margin: '0 0 10px', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, maxHeight: 260, overflowY: 'auto' }}>{check.message}</pre>
          {check.sentAt ? <p style={{ margin: '0 0 10px' }}>It was already sent on {String(check.sentAt).slice(0, 10)}. Confirming sends it again.</p> : null}
          <p style={{ margin: 0, display: 'flex', gap: 12 }}>
            <button type="button" className="btn btn--style-primary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={() => act({ confirm: true, again: check.sentAt != null }, (r) => `Sent to ${r.to.join(', ')}. ${r.warning ?? ''}`)}>
              Confirm and send
            </button>
            <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </p>
        </div>
      ) : null}
      {note ? <p style={{ margin: '10px 0 0' }}>{note}</p> : null}
      {error ? <p style={{ margin: '10px 0 0', color: 'var(--theme-error-500)' }}>{error}</p> : null}
    </div>
  )
}
