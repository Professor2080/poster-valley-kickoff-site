import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Drop } from '../data/drops'
import { submitJson } from '../lib/formSubmit'

type InterestFormData = {
  name: string
  email: string
  country: string
  format: string
  quantity: string
  address: string
  note: string
  company: string
  consentContact: boolean
}

const initialFormData: InterestFormData = {
  name: '',
  email: '',
  country: '',
  format: 'A2',
  quantity: '1',
  address: '',
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
      name: formData.name,
      email: formData.email,
      country: formData.country,
      format: formData.format,
      quantity: formData.quantity,
      address: formData.address,
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
        <p className="eyebrow text-white/45">Follow this drop</p>
        <h2 className="mt-4 font-heading text-[clamp(3rem,6vw,6.4rem)] font-semibold leading-[0.9] tracking-[-0.075em]">
          Reserve interest for {drop.title}.
        </h2>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-white/58">
          Leave your details for this specific poster. This is an interest request, not a payment
          or final order confirmation.
        </p>
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2">
        <label className="hidden" aria-hidden="true">
          Company
          <input
            tabIndex={-1}
            autoComplete="off"
            value={formData.company}
            onChange={(event) => handleChange('company', event.target.value)}
          />
        </label>
        <Field label="Full name" value={formData.name} onChange={(value) => handleChange('name', value)} required />
        <Field
          label="Email"
          type="email"
          value={formData.email}
          onChange={(value) => handleChange('email', value)}
          required
        />
        <Field
          label="Country"
          value={formData.country}
          onChange={(value) => handleChange('country', value)}
          required
        />
        <label className="field">
          <span>Preferred format</span>
          <select value={formData.format} onChange={(event) => handleChange('format', event.target.value)}>
            <option value="A2">A2 source artwork</option>
            <option value="A3">A3 interest</option>
            <option value="A1">A1 interest</option>
            <option value="Undecided">Undecided</option>
          </select>
        </label>
        <label className="field">
          <span>Quantity indication</span>
          <select value={formData.quantity} onChange={(event) => handleChange('quantity', event.target.value)}>
            <option value="1">1 poster</option>
            <option value="2">2 posters</option>
            <option value="3">3 posters</option>
          </select>
        </label>
        <Field
          label="Shipping address optional"
          value={formData.address}
          onChange={(value) => handleChange('address', value)}
        />
        <label className="field md:col-span-2">
          <span>Note optional</span>
          <textarea
            value={formData.note}
            onChange={(event) => handleChange('note', event.target.value)}
            placeholder="Anything we should know before sending final print details?"
            rows={4}
          />
        </label>
      </div>

      <label className="mt-6 flex gap-3 text-sm leading-6 text-white/58">
        <input
          required
          type="checkbox"
          checked={formData.consentContact}
          onChange={(event) => handleChange('consentContact', event.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 accent-white"
        />
        <span>
          Poster Valley may contact me about this specific poster request, including final print
          details, price, payment link and shipping steps.
        </span>
      </label>

      <div className="mt-7 rounded-[1.5rem] border border-white/12 bg-white/[0.045] p-5 text-sm leading-6 text-white/56">
        No payment is taken now. Final price, paper, availability and shipping details are confirmed
        before any payment link is sent.
      </div>

      <button
        type="submit"
        className="button-primary mt-7 w-full justify-center md:w-auto"
        disabled={status === 'submitting'}
      >
        {status === 'submitting' ? 'Saving interest...' : 'Send drop interest'}
      </button>

      {status === 'success' ? (
        <p className="mt-4 text-sm leading-6 text-white/58">
          Saved. We will contact you before any payment or final order confirmation.
        </p>
      ) : null}
      {status === 'error' ? <p className="mt-4 text-sm leading-6 text-white/58">{errorMessage}</p> : null}
    </form>
  )
}

function Field({
  label,
  type = 'text',
  value,
  onChange,
  required,
}: {
  label: string
  type?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
      />
    </label>
  )
}
