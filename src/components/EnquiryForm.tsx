'use client'

import { useActionState, useEffect, useState } from 'react'

import { type EnquiryState, submitEnquiry } from '@/lib/enquiry.ts'

const SERVICES = [
  'Active Pharmaceutical Ingredients',
  'Pharmaceutical Excipients',
  'Medical Consumables',
  'Medical Devices and Equipment',
  'Sourcing Consultancy',
  'Independent Verification',
]
const VERIFICATION = ['Supplier Verification Report', 'Pre-shipment Verification', 'Dossier / Document Review']

// UTM first touch kept in localStorage, last touch from the current URL (docs/03).
function useUtm() {
  const [utm, setUtm] = useState({ first: '', last: '' })
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const now = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .filter((k) => q.get(k))
      .map((k) => `${k}=${q.get(k)}`)
      .join('&')
    let first = ''
    try {
      first = localStorage.getItem('njmc_utm_first') ?? ''
      if (!first && now) localStorage.setItem('njmc_utm_first', (first = now))
    } catch {
      /* storage blocked: first touch unknown */
    }
    setUtm({ first, last: now })
  }, [])
  return utm
}

export function EnquiryForm({ kind = 'rfq' }: { kind?: 'rfq' | 'verification' }) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitEnquiry, null)
  const utm = useUtm()
  const [page, setPage] = useState('')
  // Arriving from a catalogue product page: /contact/?product=<name>#rfq
  const [product, setProduct] = useState('')
  useEffect(() => {
    setPage(window.location.pathname)
    setProduct((new URLSearchParams(window.location.search).get('product') ?? '').slice(0, 120))
  }, [])

  if (state?.ok) {
    return (
      <div className="enquiry-done" role="status">
        <p>{state.message}</p>
      </div>
    )
  }

  const verification = kind === 'verification'
  return (
    <form action={action} className="enquiry-form" data-event={verification ? 'verification_order_submit' : 'rfq_submit'}>
      <h2>{verification ? 'Order a verification' : 'Send a request for quotation'}</h2>
      <p className="enquiry-note">
        {verification
          ? 'No online payment. We reply with payment instructions. The fee is payable regardless of outcome.'
          : 'Technical enquiries are answered by Dr. Qaria directly rather than by a sales desk.'}
      </p>
      <input type="hidden" name="type" value={kind} />
      <input type="hidden" name="page" value={page} />
      <input type="hidden" name="utmFirst" value={utm.first} />
      <input type="hidden" name="utmLast" value={utm.last} />
      <div className="hp" aria-hidden="true">
        <label>
          Website <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <div className="enquiry-grid">
        <label>
          Name *<input name="name" required maxLength={200} autoComplete="name" />
        </label>
        <label>
          Company<input name="company" maxLength={200} autoComplete="organization" />
        </label>
        <label>
          Role<input name="role" maxLength={200} autoComplete="organization-title" />
        </label>
        <label>
          Country *<input name="country" required maxLength={200} autoComplete="country-name" />
        </label>
        <label>
          Email *<input name="email" type="email" required maxLength={200} autoComplete="email" />
        </label>
        <label>
          Phone or WhatsApp<input name="phone" maxLength={200} autoComplete="tel" />
        </label>
      </div>
      <label>
        {verification ? 'Service *' : 'Service'}
        <select name="service" defaultValue={verification ? VERIFICATION[0] : ''} required={verification}>
          {!verification && <option value="">Choose a service</option>}
          {(verification ? VERIFICATION : SERVICES).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {verification && (
        <label>
          Supplier or product to check
          <input name="supplier" maxLength={200} />
        </label>
      )}
      <label>
        {verification ? 'What should we check? *' : 'What do you need? *'}
        <textarea
          key={product}
          name="message"
          defaultValue={product ? `Product: ${product}\nGrade or specification:\nQuantity:\nDestination market:` : undefined}
          required
          rows={6}
          maxLength={5000}
          placeholder={verification ? 'Order details, documents you have, deadline' : 'Product or molecule, grade or standard, quantity, destination market'}
        />
      </label>
      <label>
        How did you hear about us? *<input name="heardAbout" required maxLength={200} />
      </label>
      <label className="enquiry-consent">
        <input type="checkbox" name="consent" required /> I agree that NJMC stores these details to reply to my request.
      </label>
      {state && !state.ok && (
        <p className="enquiry-error" role="alert">
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Sending' : verification ? 'Send verification order' : 'Send request'}
      </button>
      <p className="enquiry-note">
        Documents can follow by email to <a href="mailto:sale@njmcmedicsupp.com">sale@njmcmedicsupp.com</a> once we reply.
      </p>
    </form>
  )
}
