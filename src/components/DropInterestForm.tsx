import { useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
import type { Drop } from '../data/drops'
import { countries } from '../data/countries'
import { submitJson } from '../lib/formSubmit'

type InterestFormData = {
  firstName: string
  lastName: string
  email: string
  country: string
  quantity: string
  note: string
  company: string
  acceptedReservationTerms: boolean
  marketingOptIn: boolean
}

const initialFormData: InterestFormData = {
  firstName: '',
  lastName: '',
  email: '',
  country: '',
  quantity: '1',
  note: '',
  company: '',
  acceptedReservationTerms: false,
  marketingOptIn: false,
}

export function DropInterestForm({ drop }: { drop: Drop }) {
  const [formData, setFormData] = useState(initialFormData)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleChange = (field: keyof InterestFormData, value: string | boolean) => {
    setFormData((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('submitting')
    setErrorMessage('')

    const country = formData.country.trim()

    if (!countries.includes(country)) {
      setErrorMessage('Please select a country from the list.')
      setStatus('error')
      return
    }

    const result = await submitJson('/api/interest', {
      dropSlug: drop.slug,
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      country,
      quantity: formData.quantity,
      note: formData.note,
      company: formData.company,
      acceptedReservationTerms: formData.acceptedReservationTerms,
      marketingOptIn: formData.marketingOptIn,
      sourcePath: window.location.pathname,
    })

    if (!result.ok) {
      setErrorMessage(result.message)
      setStatus('error')
      return
    }

    setFormData(initialFormData)
    setStatus('success')
  }

  return (
    <form id="drop-interest" onSubmit={handleSubmit} className="drop-form scroll-mt-28">
      <div>
        <p className="eyebrow text-white/45">Poster reservation</p>
        <h2 className="mt-4 font-heading text-[clamp(3rem,6vw,6.4rem)] font-semibold leading-[0.9] tracking-[-0.075em]">
          Reserve your copy.
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-white/58">
          Leave your details for this specific poster. No payment is taken now and this is not a
          binding order. If the poster goes into production, we send a personal order link before
          you enter address details or pay.
        </p>
      </div>

      <div className="mt-10 rounded-[1.5rem] border border-white/12 bg-white/[0.045] p-5 text-sm leading-6 text-white/62 md:p-7">
        <div className="grid gap-5 md:grid-cols-3">
          <SummaryItem label="Poster" value={drop.title} />
          <SummaryItem label="Size" value={drop.dimensions.display} />
          <SummaryItem label="Current poster price" value={drop.priceLabel} />
        </div>
        <p className="mt-5 text-sm leading-6 text-white/48">
          Shipping is calculated later. Final price including shipping will be sent before payment.
        </p>
      </div>

      {status === 'success' ? (
        <div className="confirmation-card mt-10" role="status" aria-live="polite">
          <CheckCircle2 className="h-8 w-8 shrink-0" aria-hidden="true" />
          <div>
            <p className="eyebrow text-white/45">Reservation saved</p>
            <h3 className="mt-4 font-heading text-[clamp(2.4rem,4.5vw,4.8rem)] font-semibold leading-[0.92] tracking-[-0.065em]">
              We have saved your reservation for {drop.title}.
            </h3>
            <p className="mt-5 max-w-2xl text-base leading-7 text-white/62">
              No payment has been taken. If this poster goes into production, we will send a
              personal order invitation with final price, shipping and address steps before you
              decide whether to order.
            </p>
            <button type="button" className="button-secondary mt-7" onClick={() => setStatus('idle')}>
              Reserve another copy
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-12 grid gap-8">
            <label className="hidden" aria-hidden="true">
              Company
              <input
                tabIndex={-1}
                autoComplete="off"
                value={formData.company}
                onChange={(event) => handleChange('company', event.target.value)}
              />
            </label>
            <Field
              label="First Name"
              value={formData.firstName}
              onChange={(value) => handleChange('firstName', value)}
              autoComplete="given-name"
              required
            />
            <Field
              label="Last Name"
              value={formData.lastName}
              onChange={(value) => handleChange('lastName', value)}
              autoComplete="family-name"
              required
            />
            <Field
              label="Email Address"
              type="email"
              value={formData.email}
              onChange={(value) => handleChange('email', value)}
              autoComplete="email"
              required
            />
            <Field
              label="Country"
              value={formData.country}
              onChange={(value) => handleChange('country', value)}
              autoComplete="country-name"
              list="country-options"
              placeholder="Start typing to search your country"
              required
            />
            <datalist id="country-options">
              {countries.map((country) => (
                <option key={country} value={country} />
              ))}
            </datalist>
            <label className="reservation-field">
              <span className="reservation-field-head">
                <span>Quantity</span>
                <span className="reservation-required" aria-hidden="true">
                  *
                </span>
              </span>
              <select
                required
                value={formData.quantity}
                onChange={(event) => handleChange('quantity', event.target.value)}
              >
                <option value="1">1 poster</option>
                <option value="2">2 posters</option>
                <option value="3">3 posters</option>
                <option value="4">4 posters</option>
                <option value="5">5 posters</option>
              </select>
            </label>
            <label className="reservation-field">
              <span className="reservation-field-head">
                <span>Note optional</span>
              </span>
              <textarea
                value={formData.note}
                onChange={(event) => handleChange('note', event.target.value)}
                placeholder="Anything we should know before sending production details?"
                rows={4}
              />
            </label>
          </div>

          <label className="consent-choice mt-7">
            <input
              required
              type="checkbox"
              checked={formData.acceptedReservationTerms}
              onChange={(event) => handleChange('acceptedReservationTerms', event.target.checked)}
              className="mt-0.5 h-6 w-6 shrink-0 accent-white"
            />
            <span>
              I understand this is a reservation of interest, not an order or payment, and Poster
              Valley may contact me about this specific poster if it moves into production.
            </span>
          </label>

          <label className="consent-choice mt-3">
            <input
              type="checkbox"
              checked={formData.marketingOptIn}
              onChange={(event) => handleChange('marketingOptIn', event.target.checked)}
              className="mt-0.5 h-6 w-6 shrink-0 accent-white"
            />
            <span>Keep me updated about future Poster Valley drops.</span>
          </label>

          <div className="mt-7 rounded-[1.5rem] border border-white/12 bg-white/[0.045] p-5 text-sm leading-6 text-white/56">
            Address details are only requested later if you choose to confirm an order. You receive
            final print details, shipping costs and a payment link before anything becomes final.
          </div>
          <p className="mt-4 text-sm leading-6 text-white/45">
            We use these details only for this poster reservation and the optional drop-update flag.
            Read the{' '}
            <a className="underline underline-offset-4 transition hover:text-white" href="/privacy">
              Privacy Notice
            </a>
            .
          </p>

          <button
            type="submit"
            className="button-primary mt-7 w-full justify-center md:w-auto"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? 'Saving reservation...' : 'Reserve your copy'}
          </button>

          {status === 'error' ? (
            <p className="mt-4 text-sm font-semibold leading-6 text-white/76">{errorMessage}</p>
          ) : null}
        </>
      )}
    </form>
  )
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.2em] text-white/38">{label}</p>
      <p className="mt-2 font-heading text-2xl tracking-[-0.045em] text-white">{value}</p>
    </div>
  )
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  required,
  autoComplete,
  list,
  placeholder,
}: {
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  autoComplete?: string
  list?: string
  placeholder?: string
}) {
  return (
    <label className="reservation-field">
      <span className="reservation-field-head">
        <span>{label}</span>
        {required ? (
          <span className="reservation-required" aria-hidden="true">
            *
          </span>
        ) : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        autoComplete={autoComplete}
        list={list}
        placeholder={placeholder}
      />
    </label>
  )
}
