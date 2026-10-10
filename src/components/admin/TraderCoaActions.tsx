'use client'

import { useDocumentInfo, useFormModified } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

// On a certificate on our letterhead: let AI read the supplier's certificate, see what is missing,
// see what was changed since the reading, and open the two PDFs.
type Check = { coa: string[]; spec: string[]; changes: string[]; readAt: string; aiOn: boolean; hasOriginal: boolean; issuedAt: string; issuedBy: string; licence: string; eligible: { id: number | string; name: string; licence: string }[] }

const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 14, margin: '0 0 18px' }
const warn: React.CSSProperties = { background: 'var(--theme-warning-100)', border: '1px solid var(--theme-warning-400)', borderRadius: 4, padding: '8px 10px', margin: '10px 0 0' }
const btn = 'btn btn--size-small'

export function TraderCoaActions() {
  const { id, lastUpdateTime } = useDocumentInfo()
  const modified = useFormModified()
  const [check, setCheck] = useState<Check | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (id == null) return
    const r = await fetch(`/api/trader-coas/${id}/check/`, { credentials: 'include' })
    if (r.ok) setCheck(await r.json())
  }, [id])
  useEffect(() => {
    void load()
  }, [load, lastUpdateTime])

  if (id == null) {
    return (
      <div style={box}>
        <p style={{ margin: 0 }}>
          1. Upload the supplier&apos;s certificate below, type the product name and save. 2. Press &quot;Read the certificate with AI&quot; (or type the
          fields). 3. Check every row against the original. 4. Print the certificate on your letterhead, or the specification sheet for quoting.
        </p>
      </div>
    )
  }

  const read = async (replace = false) => {
    setBusy(true)
    setError('')
    setNote('AI is reading the certificate. This takes up to a minute.')
    try {
      const r = await fetch(`/api/trader-coas/${id}/read/`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ replace }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.status === 409) {
        setNote('')
        if (window.confirm('Replace the test rows already here with a new reading?')) return read(true)
        setBusy(false)
        return
      }
      if (!r.ok) throw new Error(j.error || 'failed')
      // The fields were written on the server: reload to show them.
      window.location.reload()
      return
    } catch (e) {
      setNote('')
      setError((e as Error).message)
    }
    setBusy(false)
  }

  const issue = async () => {
    if (!window.confirm('Issue this certificate? Open the preview first and check every row against the original. After issuing, nothing on it can be changed: a correction needs a new certificate (Duplicate).')) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/trader-coas/${id}/issue/`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: true }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'failed')
      window.location.reload()
      return
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }

  const pdf = (type: 'coa' | 'spec', gaps: string[] | undefined, label: string) => {
    const ready = check && !gaps?.length && !modified
    return (
      <div style={{ margin: '10px 0 0' }}>
        {ready ? (
          <a className={`${btn} btn--style-primary`} style={{ margin: 0 }} href={`/api/trader-coas/${id}/pdf/${type}/`} target="_blank" rel="noreferrer">{label}</a>
        ) : (
          <button type="button" className={`${btn} btn--style-secondary`} style={{ margin: 0 }} disabled>{label}</button>
        )}
        {modified && <span style={{ marginInlineStart: 10 }}>Save first.</span>}
        {!modified && gaps?.length ? <span style={{ marginInlineStart: 10 }}>Missing: {gaps.join('; ')}.</span> : null}
      </div>
    )
  }

  return (
    <div style={box}>
      <p style={{ margin: '0 0 8px' }}>
        {check?.readAt ? `Read by AI on ${check.readAt.slice(0, 16).replace('T', ' ')}. ` : ''}
        Check every row against the supplier&apos;s original before printing. The certificate always names the manufacturer and attaches the original.
      </p>
      {check?.issuedAt ? (
        <p style={{ margin: 0 }}><strong>Issued {check.issuedAt.slice(0, 10)}{check.issuedBy ? ` by ${check.issuedBy}` : ''}. Locked:</strong> a correction needs a new certificate (Duplicate in the menu at the top).</p>
      ) : (
        <>
          <button type="button" className={`${btn} btn--style-secondary`} style={{ margin: 0 }} disabled={busy || !check?.hasOriginal || !check?.aiOn || modified} onClick={() => read()}>
            Read the certificate with AI
          </button>
          {check && !check.hasOriginal && <span style={{ marginInlineStart: 10 }}>{check.coa[0] ?? "Upload the supplier's certificate and save first."}</span>}
          {check?.hasOriginal && !check.aiOn && <span style={{ marginInlineStart: 10 }}>AI mode is off (Company details for documents): type the fields yourself.</span>}
        </>
      )}
      {note && <p style={{ margin: '8px 0 0' }}>{note}</p>}
      {error && <p style={{ margin: '8px 0 0', color: 'var(--theme-error-500)' }}>{error}</p>}
      {check && !check.issuedAt && (
        <p style={{ margin: '10px 0 0' }}>
          {check.licence ? <>Released under: {check.licence}. </> : null}
          {check.eligible.length
            ? <>Companies licensed for this kind of product: {check.eligible.map((c) => c.name).join(', ')}.</>
            : <>Choose the kind of product to see which company may release it. If none is listed, add the licence in Our companies.</>}
        </p>
      )}
      {check?.changes.length ? (
        <div style={warn}>
          <strong>Changed since the AI reading ({check.changes.length}).</strong> Only correct real misreadings: the printed results must match the attached original.
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{check.changes.slice(0, 20).map((c) => <li key={c}>{c}</li>)}</ul>
        </div>
      ) : null}
      {pdf('coa', check?.coa, check?.issuedAt ? 'Certificate of analysis on our letterhead (PDF)' : 'Preview the certificate (PDF, marked DRAFT)')}
      {check && !check.issuedAt && (
        <div style={{ margin: '10px 0 0' }}>
          <button type="button" className={`${btn} btn--style-primary`} style={{ margin: 0 }} disabled={busy || modified || check.coa.length > 0} onClick={issue}>
            Issue the certificate
          </button>
          <span style={{ marginInlineStart: 10 }}>Then it prints without the DRAFT mark and is locked.</span>
        </div>
      )}
      {pdf('spec', check?.spec, 'Specification sheet for quoting (PDF)')}
    </div>
  )
}
