import { useState } from 'react'
import type { FormEvent } from 'react'
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
  consentContact: boolean
}

const initialFormData: InterestFormData = {
  firstName: '',
  lastName: '',
  email: '',
  country: '',
  quantity: '1',
  note: '',
  company: '',
  consentContact: false,
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

    const result = await submitJson('/api/interest', {
      dropSlug: drop.slug,
      dropTitle: drop.title,
      name: `${formData.firstName} ${formData.lastName}`.trim(),
      email: formData.email,
      country: formData.country,
      format: drop.size ?? 'A2 (42 x 60 cm)',
      quantity: formData.quantity,
      address: '',
      note: formData.note,
      company: formData.company,
      consentContact: formData.consentContact,
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
          Leave your details for this specific poster. No payment is taken now. Once the Edition is
          confirmed, your reservation becomes a pre-order with a payment link.
        </p>
      </div>

      <div className="mt-10 rounded-[1.5rem] border border-white/12 bg-white/[0.045] p-5 text-sm leading-6 text-white/62 md:p-7">
        <div className="grid gap-5 md:grid-cols-3">
          <SummaryItem label="Poster" value={drop.title} />
          <SummaryItem label="Size" value={drop.size ?? 'A2 (42 x 60 cm)'} />
          <SummaryItem label="Poster price" value={drop.price ?? '€17,75'} />
        </div>
      </div>

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
          <select required value={formData.quantity} onChange={(event) => handleChange('quantity', event.target.value)}>
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
            placeholder="Anything we should know before sending print details and the payment link?"
            rows={4}
          />
        </label>
      </div>

      <label className="consent-choice mt-7">
        <input
          required
          type="checkbox"
          checked={formData.consentContact}
          onChange={(event) => handleChange('consentContact', event.target.checked)}
          className="mt-0.5 h-6 w-6 shrink-0 accent-white"
        />
        <span>
          Poster Valley may contact me about this specific poster reservation, including final
          print details, shipping costs, payment link and production updates.
        </span>
      </label>

      <div className="mt-7 rounded-[1.5rem] border border-white/12 bg-white/[0.045] p-5 text-sm leading-6 text-white/56">
        No payment is taken now. You receive the price, print details, shipping costs and payment
        link before your reservation becomes final.
      </div>
      <p className="mt-4 text-sm leading-6 text-white/45">
        We use these details only for this poster reservation. Read the{' '}
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

      {status === 'success' ? (
        <p className="mt-4 text-sm leading-6 text-white/58">
          Saved. We will contact you before any payment or final pre-order confirmation.
        </p>
      ) : null}
      {status === 'error' ? <p className="mt-4 text-sm leading-6 text-white/58">{errorMessage}</p> : null}
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
