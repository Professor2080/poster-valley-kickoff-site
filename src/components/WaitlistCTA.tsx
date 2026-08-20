import { useState } from 'react'
import type { FormEvent } from 'react'

export function WaitlistCTA() {
  const [email, setEmail] = useState('')
  const [saved, setSaved] = useState(false)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaved(true)
    setEmail('')
  }

  return (
    <section id="waitlist" className="section-pad bg-ink text-paper">
      <div className="mx-auto grid max-w-[82rem] gap-10 border-t border-white/12 pt-14 lg:grid-cols-[1fr_0.8fr] lg:items-end">
        <div>
          <p className="eyebrow text-white/45">Get updates</p>
          <h2 className="mt-5 max-w-4xl font-heading text-[clamp(3.2rem,7vw,7rem)] font-semibold leading-[0.9] tracking-[-0.08em]">
            Follow the next Design into view.
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-8 text-white/56">
            This Preview keeps the update form local. It sends no email and stores no visitor data.
          </p>
        </div>
        {saved ? (
          <div className="local-success" role="status" aria-live="polite">
            <p className="eyebrow text-white/45">Prototype only</p>
            <h3>Update interest noted locally.</h3>
            <p>No data was sent or stored.</p>
            <button type="button" className="button-secondary" onClick={() => setSaved(false)}>Back to form</button>
          </div>
        ) : (
          <form onSubmit={submit} className="local-update-form">
            <label htmlFor="prototype-update-email">Email address</label>
            <input
              id="prototype-update-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
            />
            <button type="submit" className="button-primary">Preview update state</button>
          </form>
        )}
      </div>
    </section>
  )
}
