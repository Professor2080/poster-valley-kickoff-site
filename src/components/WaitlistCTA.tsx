import { useState } from 'react'
import type { FormEvent } from 'react'

export function WaitlistCTA() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'opened'>('idle')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const subject = encodeURIComponent('Poster Valley first drop notification')
    const body = encodeURIComponent(
      `Please notify me when the first Poster Valley drop opens.\n\nEmail: ${email}`,
    )

    window.location.href = `mailto:studio@postervalley.com?subject=${subject}&body=${body}`
    setStatus('opened')
  }

  return (
    <section id="waitlist" className="section-pad bg-ink text-paper">
      <div className="mx-auto grid max-w-[82rem] gap-10 border-y border-white/12 py-16 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <p className="eyebrow text-white/45">Notify me</p>
          <h2 className="mt-5 max-w-4xl font-heading text-[clamp(3.4rem,7vw,7.3rem)] font-semibold leading-[0.88] tracking-[-0.08em]">
            Be first to know when the first drop opens.
          </h2>
          <p className="mt-7 max-w-xl text-lg leading-8 text-white/58">
            Launch date, print details and availability - sent when the first Poster Valley release
            is ready.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
          <button type="submit" className="button-primary w-full justify-center">
            Get notified
          </button>
          <p className="text-sm leading-6 text-white/45">
            Temporary placeholder: this opens your email client. Database storage should be
            connected before public launch.
          </p>
          {status === 'opened' ? (
            <p className="text-sm leading-6 text-white/60">
              Your email client should now contain the prepared notification request.
            </p>
          ) : null}
        </form>
      </div>
    </section>
  )
}
