'use client'

import { useFormFields } from '@payloadcms/ui'
import { useState } from 'react'

// Buttons in Company details: fetch today's exchange rates now, and test the saved AI key.
const box: React.CSSProperties = { border: '1px solid var(--theme-elevation-150)', borderRadius: 4, padding: 12, margin: '0 0 14px' }

async function post(url: string) {
  const r = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `failed (${r.status})`)
  return j
}

export function RatesTools() {
  const mode = useFormFields(([f]) => f.rateMode?.value)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const r = await post('/api/globals/trade-settings/refresh-rates/')
      setNote(`Updated: 1 USD = ${r.cnyPerUsd} CNY, 1 EUR = ${r.usdPerEur} USD (rates of ${r.date}). Reload the page to see them in the fields.`)
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <div style={box}>
      <p style={{ margin: '0 0 8px' }}>
        {mode === 'manual'
          ? 'You type the rates yourself. They stay as you set them.'
          : 'Automatic: the rates are fetched once a day from the European Central Bank reference rates. To use your bank\'s rate instead, choose "I type them myself".'}
      </p>
      <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={run}>
        Get today's rates now
      </button>
      {note ? <p style={{ margin: '8px 0 0' }}>{note}</p> : null}
    </div>
  )
}

export function AiTools() {
  const on = useFormFields(([f]) => f.aiMode?.value)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try {
      const r = await post('/api/globals/trade-settings/test-ai/')
      setNote(`The key works with ${r.model}.`)
    } catch (e) {
      setNote((e as Error).message)
    }
    setBusy(false)
  }
  return (
    <div style={box}>
      <p style={{ margin: '0 0 8px' }}>
        {on
          ? 'AI mode is on: on a supplier enquiry, "Read the reply with AI" fills in the prices from a pasted email or WeChat message. You check them before they are saved. Each reading uses the API key and costs a few cents.'
          : 'Simple mode: everything works without AI and without any AI cost. Switch AI mode on to let AI read supplier replies.'}
      </p>
      <button type="button" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }} disabled={busy} onClick={run}>
        Test the saved key
      </button>
      {note ? <p style={{ margin: '8px 0 0' }}>{note}</p> : null}
      <p style={{ margin: '8px 0 0', opacity: 0.75 }}>A new key takes effect when you Save. Save first, then test.</p>
    </div>
  )
}
