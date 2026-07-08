import { useState } from 'react'
import type { FormEvent } from 'react'
import { submitJson } from '../lib/formSubmit'

export function WaitlistCTA() {
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [consentNewsletter, setConsentNewsletter] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('submitting')
    setErrorMessage('')

    const result = await submitJson('/api/newsletter', {
      email,
      company,
      consentNewsletter,
      sourcePath: window.location.pathname,
    })

    if (!result.ok) {
      setErrorMessage(result.message)
      setStatus('error')
      return
    }

    setEmail('')
    setCompany('')
    setConsentNewsletter(false)
    setStatus('success')
  }

  return (
    <section id="waitlist" className="section-pad bg-ink text-paper">
      <div className="mx-auto grid max-w-[82rem] gap-10 border-y border-white/12 py-16 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="eyebrow text-white/45">Get updates</p>
          <h2 className="mt-5 max-w-4xl font-heading text-[clamp(3.4rem,7vw,7.3rem)] font-semibold leading-[0.88] tracking-[-0.08em]">
            Stay updated on new releases.
          </h2>
          <p className="mt-7 max-w-xl text-lg leading-8 text-white/58">
            General updates about Poster Valley, new Designs and release notes. Poster-specific
            reservations stay on each poster detail page.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="hidden" aria-hidden="true">
            Company
            <input
              tabIndex={-1}
              autoComplete="off"
              value={company}
              onChange={(event) => setCompany(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Email address</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
          <label className="flex gap-3 text-sm leading-6 text-white/50">
            <input
              required
              type="checkbox"
              checked={consentNewsletter}
              onChange={(event) => setConsentNewsletter(event.target.checked)}
              className="mt-1 h-4 w-4 shrink-0 accent-white"
            />
            <span>Poster Valley may send me launch updates and occasional release notes.</span>
          </label>
          <button
            type="submit"
            className="button-primary w-full justify-center"
            disabled={status === 'submitting'}
          >
            {status === 'submitting' ? 'Saving...' : 'Stay updated'}
          </button>
          <p className="text-sm leading-6 text-white/45">
            General updates only. Poster-specific requests are collected on each poster page.
          </p>
          {status === 'success' ? (
            <p className="text-sm leading-6 text-white/60">Saved. You are on the update list.</p>
          ) : null}
          {status === 'error' ? <p className="text-sm leading-6 text-white/60">{errorMessage}</p> : null}
        </form>
      </div>
    </section>
  )
}
