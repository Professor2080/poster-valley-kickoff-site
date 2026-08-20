import { CheckCircle2, Copy, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Drop } from '../data/drops'
import { countries } from '../data/countries'
import { PrintMeter } from './PrintMeter'

type InterestFormData = {
  firstName: string
  lastName: string
  email: string
  country: string
  quantity: string
  note: string
  acceptedReservationTerms: boolean
}

const initialFormData: InterestFormData = {
  firstName: '', lastName: '', email: '', country: '', quantity: '1', note: '', acceptedReservationTerms: false,
}

export function DropInterestForm({ drop }: { drop: Drop }) {
  const [formData, setFormData] = useState(initialFormData)
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const [shareStatus, setShareStatus] = useState('')
  const quantity = Number(formData.quantity)
  const previewProgress = drop.progress
    ? { ...drop.progress, reservedCopies: drop.progress.reservedCopies + quantity }
    : undefined

  const change = (field: keyof InterestFormData, value: string | boolean) => {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setShareStatus('')
    setStatus('success')
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareStatus('Link copied. No message was sent.')
    } catch {
      setShareStatus('Copy is not available in this browser. No message was sent.')
    }
  }

  return (
    <div id="drop-interest" className="drop-form scroll-mt-28">
      {status === 'success' ? (
        <div className="prototype-success" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden="true" />
          <p className="eyebrow text-white/45">Local prototype success</p>
          <h2>You're in.</h2>
          {previewProgress ? <PrintMeter progress={previewProgress} /> : null}
          <p>
            This visual state is local only. No reservation, customer record, email, order or payment was created.
          </p>
          <div className="prototype-share-actions">
            <button type="button" className="button-secondary" onClick={() => setShareStatus('WhatsApp share previewed. Nothing was sent.')}>
              <MessageCircle aria-hidden="true" /> Share via WhatsApp
            </button>
            <button type="button" className="button-secondary" onClick={copyLink}>
              <Copy aria-hidden="true" /> Copy link
            </button>
          </div>
          <p className="prototype-share-status" aria-live="polite">{shareStatus}</p>
          <div className="prototype-success-links">
            <a href="#drop-top">Back to this drop</a>
            <a href="/#drops">Explore other live drops</a>
            <button type="button" onClick={() => { setStatus('idle'); setShareStatus('') }}>Review the form again</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div>
            <p className="eyebrow text-white/45">Join the drop · prototype</p>
            <h2>Make this Design possible.</h2>
            <p>
              Review the current interest flow without submitting anything. No payment is taken and
              no field value leaves this browser.
            </p>
          </div>

          <div className="join-summary">
            <SummaryItem label="Design" value={drop.title} />
            <SummaryItem label="Size" value={drop.dimensions.display} />
            <SummaryItem label="Current poster price" value={drop.priceLabel} />
          </div>

          <div className="join-fields">
            <Field label="First name" value={formData.firstName} onChange={(value) => change('firstName', value)} autoComplete="given-name" required />
            <Field label="Last name" value={formData.lastName} onChange={(value) => change('lastName', value)} autoComplete="family-name" required />
            <Field label="Email address" type="email" value={formData.email} onChange={(value) => change('email', value)} autoComplete="email" required />
            <Field label="Country" value={formData.country} onChange={(value) => change('country', value)} autoComplete="country-name" list="country-options" placeholder="Start typing to search" required />
            <datalist id="country-options">{countries.map((country) => <option key={country} value={country} />)}</datalist>
            <label className="reservation-field">
              <span className="reservation-field-head"><span>Quantity</span><span className="reservation-required" aria-hidden="true">*</span></span>
              <select required value={formData.quantity} onChange={(event) => change('quantity', event.target.value)}>
                {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item} {item === 1 ? 'poster' : 'posters'}</option>)}
              </select>
            </label>
            <label className="reservation-field join-note">
              <span className="reservation-field-head"><span>Note optional</span></span>
              <textarea value={formData.note} onChange={(event) => change('note', event.target.value)} rows={4} placeholder="Anything you would want Poster Valley to know?" />
            </label>
          </div>

          <label className="consent-choice mt-7">
            <input required type="checkbox" checked={formData.acceptedReservationTerms} onChange={(event) => change('acceptedReservationTerms', event.target.checked)} />
            <span>
              I understand this is a non-binding reservation of interest, not an order or payment.
              If the drop is confirmed, a personal order invitation would follow with final details.
            </span>
          </label>
          <p className="join-legal-note">
            Shipping is calculated later. If the target is not reached, no payment takes place. This
            prototype does not contact the existing reservation API.
          </p>
          <button type="submit" className="button-primary mt-7">Preview successful join</button>
        </form>
      )}
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div><p>{label}</p><strong>{value}</strong></div>
}

function Field({ label, type = 'text', value, onChange, required, autoComplete, list, placeholder }: {
  label: string; type?: string; value: string; onChange: (value: string) => void; required?: boolean;
  autoComplete?: string; list?: string; placeholder?: string
}) {
  return (
    <label className="reservation-field">
      <span className="reservation-field-head"><span>{label}</span>{required ? <span className="reservation-required" aria-hidden="true">*</span> : null}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} autoComplete={autoComplete} list={list} placeholder={placeholder} />
    </label>
  )
}
