import { useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2 } from 'lucide-react'
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

        {status === 'success' ? (
          <div className="confirmation-card" role="status" aria-live="polite">
            <CheckCircle2 className="h-8 w-8 shrink-0" aria-hidden="true" />
            <div>
              <p className="eyebrow text-white/45">Update list</p>
              <h3 className="mt-4 font-heading text-[clamp(2.4rem,4.5vw,4.6rem)] font-semibold leading-[0.92] tracking-[-0.065em]">
                You are on the list.
              </h3>
              <p className="mt-5 text-base leading-7 text-white/62">
                We will send calm, occasional updates about new Designs, release notes and the
                Poster Valley launch.
              </p>
              <button type="button" className="button-secondary mt-7" onClick={() => setStatus('idle')}>
                Use another email
              </button>
            </div>
          </div>
        ) : (
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
            <label className="consent-choice">
              <input
                required
                type="checkbox"
                checked={consentNewsletter}
                onChange={(event) => setConsentNewsletter(event.target.checked)}
                className="mt-0.5 h-6 w-6 shrink-0 accent-white"
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
              General updates only. Poster-specific requests are collected on each poster page. Read
              the{' '}
              <a className="underline underline-offset-4 transition hover:text-white" href="/privacy">
                Privacy Notice
              </a>
              .
            </p>
            {status === 'error' ? <p className="text-sm leading-6 text-white/60">{errorMessage}</p> : null}
          </form>
        )}
      </div>
    </section>
  )
}
