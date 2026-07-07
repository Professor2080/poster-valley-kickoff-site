import { useRef, useState } from 'react'
import type { FormEvent, PointerEvent } from 'react'
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Layers3,
  MailCheck,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'

type Poster = {
  title: string
  creator: string
  image: string
  alt: string
  price: string
  reserved: number
  target: number
  accent: string
}

type Feature = {
  title: string
  body: string
  icon: typeof Sparkles
}

type ProofItem = {
  label: string
  title: string
  body: string
  image?: string
  dark?: boolean
}

const posters: Poster[] = [
  {
    title: 'Nocturne Grid',
    creator: 'Mila Renard',
    image:
      'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1400&q=85',
    alt: 'Abstract architectural planes in coral and deep blue tones',
    price: 'From EUR 68',
    reserved: 38,
    target: 50,
    accent: 'from-coral/80 to-frost/70',
  },
  {
    title: 'Quiet Signal',
    creator: 'Studio Elian',
    image:
      'https://images.unsplash.com/photo-1494438639946-1ebd1d20bf85?auto=format&fit=crop&w=1400&q=85',
    alt: 'Minimal geometric architecture against a clear sky',
    price: 'From EUR 74',
    reserved: 21,
    target: 40,
    accent: 'from-mint/80 to-amber/70',
  },
  {
    title: 'Soft Atlas',
    creator: 'Nora Vale',
    image:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=85',
    alt: 'Warm modern interior with wall art and soft natural light',
    price: 'From EUR 62',
    reserved: 14,
    target: 35,
    accent: 'from-frost/80 to-coral/70',
  },
]

const features: Feature[] = [
  {
    title: 'Reserve without pressure',
    body: 'Choose a poster and size, leave the details we need, and receive a personal invoice and payment link when the First Print opens.',
    icon: ReceiptText,
  },
  {
    title: 'Printed only when ready',
    body: 'Production starts after enough confirmed reservations. No countdown tricks, no fake scarcity, only clear publication progress.',
    icon: Layers3,
  },
  {
    title: 'Shipped with care',
    body: 'We collect shipping details now so the first print run can move from studio to wall without a slow follow-up round.',
    icon: PackageCheck,
  },
]

const proofItems: ProofItem[] = [
  {
    label: 'First Print',
    title: 'Nocturne Grid anchors the launch set',
    body: 'A graphic study with strong architectural rhythm, selected as the first Poster Valley publication candidate.',
    image:
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?auto=format&fit=crop&w=1200&q=85',
  },
  {
    label: 'Collector Note',
    title: 'The site explained the print model in seconds.',
    body: 'I liked that it felt like reserving a real poster, not funding an abstract campaign.',
    dark: true,
  },
  {
    label: 'Studio Standard',
    title: 'Museum-grade paper, calm packaging, numbered first batch.',
    body: 'Each poster is planned as a physical object first: size, paper, packing and wall presence are decided together.',
    dark: true,
  },
  {
    label: 'Wall Story',
    title: 'Designed for quiet rooms and strong corners',
    body: 'The launch set focuses on Designs that can hold attention without turning a room into a showroom.',
    image:
      'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=85',
  },
]

const encodeFormData = (data: FormData) => {
  const params = new URLSearchParams()

  data.forEach((value, key) => {
    if (typeof value === 'string') {
      params.append(key, value)
    }
  })

  return params.toString()
}

function App() {
  const heroRef = useRef<HTMLElement | null>(null)
  const [formState, setFormState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const handleParallax = (event: PointerEvent<HTMLElement>) => {
    const section = heroRef.current

    if (!section || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    const bounds = section.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width - 0.5
    const y = (event.clientY - bounds.top) / bounds.height - 0.5

    section.style.setProperty('--parallax-x', `${x * 18}px`)
    section.style.setProperty('--parallax-y', `${y * 18}px`)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const formData = new FormData(form)

    setFormState('sending')

    try {
      const response = await fetch('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encodeFormData(formData),
      })

      if (!response.ok) {
        throw new Error('Reservation request failed')
      }

      form.reset()
      setFormState('sent')
    } catch {
      setFormState('error')
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(67,214,180,0.20),transparent_32%),radial-gradient(circle_at_80%_20%,rgba(255,126,95,0.18),transparent_28%),radial-gradient(circle_at_50%_95%,rgba(246,195,112,0.15),transparent_30%),linear-gradient(135deg,#07100f_0%,#101417_46%,#050607_100%)]" />

      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-ink/45 backdrop-blur-2xl">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="#top" className="group flex items-center gap-3" aria-label="Poster Valley home">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-glow transition group-hover:scale-105">
              <Sparkles className="h-4 w-4 text-mint" aria-hidden="true" />
            </span>
            <span className="font-heading text-lg font-bold">Poster Valley</span>
          </a>
          <div className="hidden items-center gap-7 text-sm text-white/70 md:flex">
            <a className="transition hover:text-white" href="#posters">
              Launch posters
            </a>
            <a className="transition hover:text-white" href="#process">
              How it works
            </a>
            <a className="transition hover:text-white" href="#reserve">
              Reserve
            </a>
          </div>
          <a
            href="#reserve"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-semibold text-white shadow-soft backdrop-blur transition hover:scale-105 hover:bg-white/16 focus:outline-none focus:ring-2 focus:ring-mint"
          >
            Reserve
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </nav>
      </header>

      <section
        id="top"
        ref={heroRef}
        onPointerMove={handleParallax}
        className="relative isolate flex min-h-screen items-center px-5 pb-20 pt-28 sm:px-8"
      >
        <div className="absolute left-1/2 top-24 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-mint/15 blur-3xl transition-transform duration-300 motion-safe:translate-x-[var(--parallax-x,0)] motion-safe:translate-y-[var(--parallax-y,0)]" />
        <div className="mx-auto grid w-full max-w-7xl items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="mx-auto max-w-3xl text-center lg:mx-0 lg:text-left">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white/78 shadow-soft backdrop-blur-xl">
              <BadgeCheck className="h-4 w-4 text-mint" aria-hidden="true" />
              First Print reservations are now open
            </div>
            <h1 className="font-heading text-5xl font-bold leading-[1.02] text-white sm:text-6xl lg:text-7xl">
              Reserve a place in the first Poster Valley print run.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-white/72 lg:mx-0">
              A temporary launch site for the first curated Designs. Select your poster, leave the
              details needed for invoice and shipping, and receive a payment link when production
              is ready to start.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
              <a
                href="#reserve"
                className="inline-flex h-14 items-center justify-center gap-3 rounded-full bg-frost px-7 font-bold text-ink shadow-glow transition hover:scale-105 hover:bg-white focus:outline-none focus:ring-2 focus:ring-mint"
              >
                Reserve the First Print
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </a>
              <a
                href="#posters"
                className="inline-flex h-14 items-center justify-center gap-3 rounded-full border border-white/20 bg-white/8 px-7 font-bold text-white backdrop-blur-xl transition hover:scale-105 hover:bg-white/14 focus:outline-none focus:ring-2 focus:ring-mint"
              >
                View launch posters
              </a>
            </div>
            <div className="mt-9 grid gap-3 text-left sm:grid-cols-3">
              {['No charge today', 'Invoice later', 'Ships after print approval'].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/8 px-4 py-3 text-sm text-white/78 backdrop-blur-xl"
                >
                  <Check className="h-4 w-4 shrink-0 text-mint" aria-hidden="true" />
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-mint/18 via-coral/10 to-amber/14 blur-3xl" />
            <article className="glass-panel group overflow-hidden rounded-[2rem] p-4 transition duration-500 hover:scale-[1.015]">
              <div className="relative overflow-hidden rounded-[1.5rem]">
                <img
                  src={posters[0].image}
                  alt={posters[0].alt}
                  className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <p className="text-sm text-white/68">Featured launch Design</p>
                  <h2 className="mt-2 font-heading text-3xl font-bold">{posters[0].title}</h2>
                  <p className="mt-1 text-white/70">By {posters[0].creator}</p>
                </div>
              </div>
              <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5">
                <div className="flex items-center justify-between gap-4 text-sm text-white/72">
                  <span>{posters[0].reserved} reservations</span>
                  <span>{posters[0].target} needed for print approval</span>
                </div>
                <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-mint via-frost to-coral"
                    style={{ width: `${(posters[0].reserved / posters[0].target) * 100}%` }}
                  />
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section id="posters" className="relative px-5 py-20 sm:px-8">
        <div className="absolute right-0 top-10 -z-10 h-96 w-96 rounded-full bg-coral/12 blur-3xl" />
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-mint">Launch posters</p>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">
              Three Designs prepared for the first print window.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/66">
              Each reservation helps confirm the first production batch. The progress shown here is
              factual and calm, so the Design stays ahead of the interface.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {posters.map((poster) => (
              <article
                key={poster.title}
                className="glass-panel group overflow-hidden rounded-[1.75rem] p-4 shadow-soft transition duration-300 hover:-translate-y-2 hover:scale-[1.01]"
              >
                <div className="relative overflow-hidden rounded-[1.25rem]">
                  <img
                    src={poster.image}
                    alt={poster.alt}
                    className="aspect-[4/5] w-full object-cover transition duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className={`absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t ${poster.accent} opacity-70`} />
                </div>
                <div className="p-3 pt-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="font-heading text-2xl font-bold">{poster.title}</h3>
                      <p className="mt-1 text-sm text-white/62">By {poster.creator}</p>
                    </div>
                    <span className="rounded-full border border-white/12 bg-white/10 px-3 py-1 text-sm text-white/72">
                      {poster.price}
                    </span>
                  </div>
                  <div className="mt-6">
                    <div className="flex items-center justify-between text-sm text-white/66">
                      <span>{poster.reserved} reserved</span>
                      <span>{poster.target} target</span>
                    </div>
                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-mint to-coral"
                        style={{ width: `${(poster.reserved / poster.target) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="process" className="px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <p className="text-sm font-semibold text-amber">How it works</p>
              <h2 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">
                A simple reservation flow before the full shop is live.
              </h2>
            </div>
            <p className="text-lg leading-8 text-white/66">
              This temporary site keeps the first launch moving without adding checkout, payment or
              Open Edition logic to the main Poster Valley platform too early.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon

              return (
                <article
                  key={feature.title}
                  className="glass-panel rounded-[1.5rem] p-7 shadow-soft transition duration-300 hover:-translate-y-2 hover:scale-[1.01]"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/12 text-mint shadow-glow">
                    <Icon className="h-6 w-6" aria-hidden="true" />
                  </div>
                  <h3 className="mt-7 font-heading text-2xl font-bold">{feature.title}</h3>
                  <p className="mt-4 leading-7 text-white/64">{feature.body}</p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-coral">Proof and atmosphere</p>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">
              Made to feel like a publication, not a campaign page.
            </h2>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-4">
            {proofItems.map((item, index) => (
              <article
                key={item.title}
                className={`min-h-[22rem] overflow-hidden rounded-[1.75rem] ${
                  item.dark
                    ? 'border border-white/12 bg-black/35 p-7 text-white shadow-soft backdrop-blur-xl'
                    : 'bg-frost text-ink shadow-glow'
                } ${index === 0 || index === 3 ? 'lg:col-span-2' : ''}`}
              >
                {item.image ? (
                  <div className="relative h-full min-h-[22rem]">
                    <img
                      src={item.image}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/18 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-7 text-white">
                      <p className="text-sm text-mint">{item.label}</p>
                      <h3 className="mt-3 font-heading text-3xl font-bold">{item.title}</h3>
                      <p className="mt-4 max-w-xl leading-7 text-white/72">{item.body}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col justify-between">
                    <QuoteMark />
                    <div>
                      <p className="text-sm text-mint">{item.label}</p>
                      <h3 className="mt-3 font-heading text-2xl font-bold">{item.title}</h3>
                      <p className="mt-4 leading-7 text-white/66">{item.body}</p>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="reserve" className="relative px-5 py-20 sm:px-8">
        <div className="absolute left-0 top-1/4 -z-10 h-[34rem] w-[34rem] rounded-full bg-mint/12 blur-3xl" />
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <p className="text-sm font-semibold text-mint">Reserve</p>
            <h2 className="mt-3 font-heading text-4xl font-bold leading-tight sm:text-5xl">
              Join the First Print list.
            </h2>
            <p className="mt-5 text-lg leading-8 text-white/66">
              Leave the details needed to prepare your invoice, payment link and shipment. You will
              not be charged from this form.
            </p>
            <div className="mt-8 space-y-4">
              {[
                'Personal invoice and payment link follow by email.',
                'Shipping details are used only for this reservation flow.',
                'Production starts after enough confirmed reservations.',
              ].map((item) => (
                <div key={item} className="flex gap-3 text-white/72">
                  <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-mint" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <form
            name="reservation"
            method="POST"
            data-netlify="true"
            data-netlify-honeypot="bot-field"
            onSubmit={handleSubmit}
            className="glass-panel rounded-[2rem] p-5 shadow-glow sm:p-8"
          >
            <input type="hidden" name="form-name" value="reservation" />
            <p className="hidden">
              <label>
                Do not fill this out: <input name="bot-field" />
              </label>
            </p>

            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Full name" name="name" autoComplete="name" required />
              <Field label="Email" name="email" type="email" autoComplete="email" required />
              <Field label="Phone optional" name="phone" type="tel" autoComplete="tel" />
              <Field label="Country" name="country" autoComplete="country-name" required />

              <label className="field md:col-span-2">
                <span>Poster</span>
                <select name="poster" required>
                  <option value="">Select a Design</option>
                  {posters.map((poster) => (
                    <option key={poster.title} value={poster.title}>
                      {poster.title} by {poster.creator}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Format</span>
                <select name="format" required>
                  <option value="">Select size</option>
                  <option value="30 x 40 cm">30 x 40 cm</option>
                  <option value="50 x 70 cm">50 x 70 cm</option>
                  <option value="70 x 100 cm">70 x 100 cm</option>
                </select>
              </label>

              <label className="field">
                <span>Quantity</span>
                <select name="quantity" required>
                  <option value="1">1 poster</option>
                  <option value="2">2 posters</option>
                  <option value="3">3 posters</option>
                </select>
              </label>

              <Field
                className="md:col-span-2"
                label="Shipping address"
                name="shipping-address"
                autoComplete="street-address"
                required
              />
              <Field label="Postal code" name="postal-code" autoComplete="postal-code" required />
              <Field label="City" name="city" autoComplete="address-level2" required />
              <Field
                className="md:col-span-2"
                label="Invoice name or company optional"
                name="invoice-name"
                autoComplete="organization"
              />

              <label className="field md:col-span-2">
                <span>Note optional</span>
                <textarea
                  name="note"
                  rows={4}
                  placeholder="Tell us if the invoice or shipment needs special handling."
                />
              </label>
            </div>

            <label className="mt-6 flex gap-3 rounded-2xl border border-white/10 bg-white/7 p-4 text-sm leading-6 text-white/70">
              <input
                required
                type="checkbox"
                name="consent"
                value="yes"
                className="mt-1 h-4 w-4 rounded border-white/20 bg-white/10 accent-mint"
              />
              I agree that Poster Valley may contact me about this reservation, invoice, payment
              link, production update and shipment.
            </label>

            <button
              type="submit"
              disabled={formState === 'sending'}
              className="mt-7 inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-frost px-7 font-bold text-ink shadow-glow transition hover:scale-[1.01] hover:bg-white focus:outline-none focus:ring-2 focus:ring-mint disabled:cursor-not-allowed disabled:opacity-60"
            >
              {formState === 'sending' ? 'Sending reservation...' : 'Send reservation request'}
              <MailCheck className="h-5 w-5" aria-hidden="true" />
            </button>

            {formState === 'sent' ? (
              <p className="mt-4 rounded-2xl border border-mint/30 bg-mint/10 p-4 text-sm text-mint">
                Reservation request sent. If this site is running on Netlify, the request is stored
                in Netlify Forms.
              </p>
            ) : null}

            {formState === 'error' ? (
              <p className="mt-4 rounded-2xl border border-coral/30 bg-coral/10 p-4 text-sm text-coral">
                The form could not be sent. Check the deployment form endpoint before publishing.
              </p>
            ) : null}
          </form>
        </div>
      </section>

      <footer className="border-t border-white/10 px-5 py-10 text-sm text-white/54 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>Poster Valley. Carefully curated Designs for your home.</p>
          <div className="flex gap-5">
            <a className="transition hover:text-white" href="mailto:studio@postervalley.com">
              studio@postervalley.com
            </a>
            <a className="transition hover:text-white" href="#top">
              Back to top
            </a>
          </div>
        </div>
      </footer>
    </main>
  )
}

function Field({
  className = '',
  label,
  name,
  type = 'text',
  autoComplete,
  required,
}: {
  className?: string
  label: string
  name: string
  type?: string
  autoComplete?: string
  required?: boolean
}) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      <input name={name} type={type} autoComplete={autoComplete} required={required} />
    </label>
  )
}

function QuoteMark() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-white/10 text-3xl text-mint">
      "
    </div>
  )
}

export default App
