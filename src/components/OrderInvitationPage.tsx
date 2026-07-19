import { useEffect, useMemo, useState } from 'react'
import { countryOptions } from '../data/countries'
import { routes } from '../lib/routes'

type Quote = {
  supported: boolean
  reason?: string
  currency: string
  countryCode: string
  countryName: string
  quantity: number
  unitPrice: number
  subtotal: number
  shipping: number | null
  total: number | null
  shippingLabel: string | null
  shippingNote: string
  reviewNeeded: boolean
}

type InvitationData = {
  status: string
  canOrder: boolean
  expiresAt: string | null
  drop: {
    title: string
    format: string
    dimensionsLabel: string
    image: string
    shippingSummary: string
  }
  customer: {
    firstName: string
    lastName: string
    email: string
  }
  quantity: number
  unitPrice: number
  subtotal: number
  quote: Quote | null
  order: {
    status: string
    total: number
    shippingCountry: string
    shippingCountryCode: string
  } | null
  payment: {
    status: string
    amount: number
    currency: string
  } | null
}

type ApiResult<T> =
  | {
      ok: true
      data: T
    }
  | {
      ok: false
      message: string
    }

type AddressForm = {
  firstName: string
  lastName: string
  email: string
  countryCode: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  city: string
  region: string
  acceptedTerms: boolean
}

const initialAddressForm: AddressForm = {
  firstName: '',
  lastName: '',
  email: '',
  countryCode: 'NL',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  region: '',
  acceptedTerms: false,
}

function isAddressFormValid(formData: AddressForm) {
  const requiredValues = [
    formData.firstName,
    formData.lastName,
    formData.email,
    formData.countryCode,
    formData.addressLine1,
    formData.postalCode,
    formData.city,
  ]

  return (
    requiredValues.every((value) => value.trim().length > 0) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email) &&
    /^[A-Z]{2}$/.test(formData.countryCode)
  )
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, init)
    const payload = (await response.json().catch(() => null)) as
      | (T & { error?: string })
      | null

    if (!response.ok) {
      return {
        ok: false,
        message: payload?.error ?? 'We could not complete this step. Please try again.',
      }
    }

    return { ok: true, data: payload as T }
  } catch {
    return {
      ok: false,
      message: 'We could not reach the server. Please try again in a moment.',
    }
  }
}

function money(value: number | null, currency = 'EUR') {
  if (value === null || value === undefined) {
    return 'To be calculated'
  }

  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value)
}

function statusCopy(invitation: InvitationData, isReturn: boolean) {
  if (invitation.payment?.status === 'paid' || invitation.order?.status === 'paid') {
    return 'Payment confirmed. Your poster order is confirmed.'
  }

  if (
    ['failed', 'canceled', 'expired'].includes(invitation.payment?.status ?? '') ||
    ['payment_failed', 'payment_expired', 'cancelled'].includes(invitation.order?.status ?? '')
  ) {
    return 'Payment was not completed. You can try again or contact Poster Valley if you need help.'
  }

  if (isReturn) {
    return 'We are checking your payment status. This usually updates within a few moments.'
  }

  if (invitation.payment?.status === 'open' || invitation.order?.status === 'payment_open') {
    return 'Payment is open. Complete it in Mollie Checkout or start again if the previous session expired.'
  }

  if (invitation.status === 'expired') {
    return 'This order invitation has expired. Contact Poster Valley if you still want to continue.'
  }

  if (invitation.status === 'cancelled') {
    return 'This order invitation is no longer active.'
  }

  return 'Your reserved poster is ready to move into production.'
}

export function OrderInvitationPage({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [formData, setFormData] = useState<AddressForm>(initialAddressForm)
  const [loading, setLoading] = useState(true)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [paymentMessage, setPaymentMessage] = useState('')
  const isReturn = useMemo(
    () => new URLSearchParams(window.location.search).get('payment') === 'return',
    [],
  )
  const isPaid =
    invitation?.payment?.status === 'paid' || invitation?.order?.status === 'paid'
  const addressFormValid = isAddressFormValid(formData)
  const quoteIsCurrent = quote?.countryCode === formData.countryCode
  const canPay = Boolean(
    invitation &&
      !isPaid &&
      invitation.canOrder &&
      addressFormValid &&
      formData.acceptedTerms &&
      quote?.supported &&
      quoteIsCurrent &&
      !quoteLoading &&
      !submitting,
  )

  useEffect(() => {
    let active = true

    async function loadInvitation() {
      setLoading(true)
      const result = await fetchJson<{ ok: true; invitation: InvitationData }>(
        `/api/order-invitation?token=${encodeURIComponent(token)}`,
      )

      if (!active) {
        return
      }

      if (!result.ok) {
        setErrorMessage(result.message)
        setLoading(false)
        return
      }

      const loadedInvitation = result.data.invitation
      const defaultCountry = loadedInvitation.order?.shippingCountryCode ?? 'NL'
      setInvitation(loadedInvitation)
      setQuote(loadedInvitation.quote)
      setFormData({
        ...initialAddressForm,
        firstName: loadedInvitation.customer.firstName ?? '',
        lastName: loadedInvitation.customer.lastName ?? '',
        email: loadedInvitation.customer.email ?? '',
        countryCode: defaultCountry,
      })
      setLoading(false)
    }

    loadInvitation()

    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    if (!invitation || !invitation.canOrder || !formData.countryCode) {
      return
    }

    let active = true

    async function loadQuote() {
      setQuoteLoading(true)
      const result = await fetchJson<{ ok: true; quote: Quote }>('/api/order-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, countryCode: formData.countryCode }),
      })

      if (!active) {
        return
      }

      if (result.ok) {
        setQuote(result.data.quote)
      } else {
        setQuote(null)
        setErrorMessage(result.message)
      }

      setQuoteLoading(false)
    }

    loadQuote()

    return () => {
      active = false
    }
  }, [formData.countryCode, invitation, token])

  function handleChange<Key extends keyof AddressForm>(key: Key, value: AddressForm[Key]) {
    setErrorMessage('')
    setPaymentMessage('')
    setFormData((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!addressFormValid) {
      setErrorMessage('Please complete all required shipping details before continuing.')
      return
    }

    if (!formData.acceptedTerms) {
      setErrorMessage('Please accept the Terms and Privacy Notice before continuing.')
      return
    }

    if (!quote?.supported) {
      setErrorMessage(quote?.reason ?? 'Shipping is not available for this country yet.')
      return
    }

    if (!canPay) {
      setErrorMessage('Please wait until the current shipping quote is ready.')
      return
    }

    setSubmitting(true)
    setErrorMessage('')
    setPaymentMessage('')

    const result = await fetchJson<{ ok: true; checkoutUrl: string }>('/api/create-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        ...formData,
      }),
    })

    setSubmitting(false)

    if (!result.ok) {
      setErrorMessage(result.message)
      return
    }

    if (result.data.checkoutUrl) {
      window.location.assign(result.data.checkoutUrl)
      return
    }

    setPaymentMessage('Payment is not configured yet.')
  }

  if (loading) {
    return (
      <section className="min-h-screen bg-paper px-5 pb-20 pt-32 text-ink sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <p className="eyebrow text-ink/42">Personal order page</p>
          <h1 className="privacy-title mt-6 max-w-4xl">Loading invitation.</h1>
        </div>
      </section>
    )
  }

  if (!invitation) {
    return (
      <section className="min-h-screen bg-paper px-5 pb-20 pt-32 text-ink sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[88rem]">
          <p className="eyebrow text-ink/42">Personal order page</p>
          <h1 className="privacy-title mt-6 max-w-4xl">Invitation unavailable.</h1>
          <p className="mt-8 max-w-2xl text-xl leading-9 text-ink/62">{errorMessage}</p>
          <a className="button-dark mt-10" href="mailto:studio@postervalley.nl">
            Contact Poster Valley
          </a>
        </div>
      </section>
    )
  }

  const confirmationTotal = money(
    invitation.payment?.amount ?? invitation.order?.total ?? quote?.total ?? null,
    invitation.payment?.currency ?? quote?.currency ?? 'EUR',
  )

  return (
    <section className="min-h-screen bg-paper px-5 pb-20 pt-28 text-ink sm:px-8 lg:px-12">
      <div className="mx-auto grid max-w-[88rem] gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
        <aside className="lg:sticky lg:top-28">
          <div className="overflow-hidden border border-ink/12 bg-white p-3 shadow-poster">
            <img
              src={invitation.drop.image}
              alt={`${invitation.drop.title} poster preview`}
              className="aspect-[0.707/1] w-full object-cover"
            />
          </div>
        </aside>

        <div>
          <p className="eyebrow text-ink/42">Personal order invitation</p>
          <h1 className="mt-7 font-heading text-[clamp(4.5rem,11vw,10rem)] font-semibold leading-[0.86] tracking-[-0.065em]">
            {invitation.drop.title}
          </h1>
          <p className="mt-8 max-w-3xl text-xl leading-9 text-ink/68">
            {isPaid
              ? 'Your payment has been confirmed. We will continue with the next production and shipping steps.'
              : 'Confirm your shipping details and complete payment to turn your reservation into an order.'}
          </p>

          <div className="mt-8 border-y border-ink/12 py-6 text-base leading-7 text-ink/62">
            {statusCopy(invitation, isReturn)}
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2">
            <SummaryRow label="Format" value={invitation.drop.dimensionsLabel} />
            <SummaryRow label="Quantity" value={`${invitation.quantity}`} />
            <SummaryRow
              label="Poster price"
              value={money(invitation.unitPrice, quote?.currency ?? 'EUR')}
            />
            <SummaryRow
              label="Subtotal"
              value={money(invitation.subtotal, quote?.currency ?? 'EUR')}
            />
            <SummaryRow
              label="Shipping"
              value={quoteLoading ? 'Calculating...' : money(quote?.shipping ?? null)}
            />
            <SummaryRow
              label="Total"
              value={quoteLoading ? 'Calculating...' : money(quote?.total ?? null)}
            />
          </div>

          {quote ? (
            <div className="mt-6 rounded-[1.5rem] border border-ink/12 bg-white/55 p-5 text-sm leading-6 text-ink/58">
              {quote.supported ? (
                <>
                  Shipping: {quote.shippingLabel}. {quote.shippingNote}
                  {quote.reviewNeeded
                    ? ' Prices include VAT where applicable. Your total is shown before you continue to payment.'
                    : ''}
                </>
              ) : (
                quote.reason
              )}
            </div>
          ) : null}

          {isPaid ? (
            <PaidConfirmationCard
              posterTitle={invitation.drop.title}
              quantity={invitation.quantity}
              total={confirmationTotal}
            />
          ) : (
            <form
              className="mt-12 rounded-[1.5rem] bg-ink p-5 text-paper shadow-2xl md:p-8"
              onSubmit={handleSubmit}
            >
            <div>
              <p className="eyebrow text-white/42">Shipping details</p>
              <h2 className="mt-5 font-heading text-5xl font-semibold leading-none tracking-[-0.055em]">
                Confirm and pay.
              </h2>
            </div>

            <div className="mt-10 grid gap-7 md:grid-cols-2">
              <Field
                label="First name"
                value={formData.firstName}
                onChange={(value) => handleChange('firstName', value)}
                autoComplete="given-name"
                required
              />
              <Field
                label="Last name"
                value={formData.lastName}
                onChange={(value) => handleChange('lastName', value)}
                autoComplete="family-name"
                required
              />
              <Field
                label="Email"
                type="email"
                value={formData.email}
                onChange={(value) => handleChange('email', value)}
                autoComplete="email"
                readOnly
                required
              />
              <label className="field">
                <span>Country</span>
                <select
                  required
                  value={formData.countryCode}
                  onChange={(event) => handleChange('countryCode', event.target.value)}
                >
                  {countryOptions.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Address line 1"
                value={formData.addressLine1}
                onChange={(value) => handleChange('addressLine1', value)}
                autoComplete="address-line1"
                required
              />
              <Field
                label="Address line 2 optional"
                value={formData.addressLine2}
                onChange={(value) => handleChange('addressLine2', value)}
                autoComplete="address-line2"
              />
              <Field
                label="Postal code"
                value={formData.postalCode}
                onChange={(value) => handleChange('postalCode', value)}
                autoComplete="postal-code"
                required
              />
              <Field
                label="City"
                value={formData.city}
                onChange={(value) => handleChange('city', value)}
                autoComplete="address-level2"
                required
              />
              <Field
                label="Region optional"
                value={formData.region}
                onChange={(value) => handleChange('region', value)}
                autoComplete="address-level1"
              />
            </div>

            {!quote || quote.supported ? (
              <label className="consent-choice mt-8">
                <input
                  required
                  type="checkbox"
                  checked={formData.acceptedTerms}
                  onChange={(event) => handleChange('acceptedTerms', event.target.checked)}
                  className="mt-0.5 h-6 w-6 shrink-0 accent-white"
                />
                <span>
                  I agree to the{' '}
                  <a
                    className="underline underline-offset-4 transition hover:text-white focus-visible:text-white"
                    href={routes.terms}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Terms
                  </a>{' '}
                  and{' '}
                  <a
                    className="underline underline-offset-4 transition hover:text-white focus-visible:text-white"
                    href={routes.privacy}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Privacy Notice
                  </a>{' '}
                  and understand that payment confirms my order.
                </span>
              </label>
            ) : null}

            {quote && !quote.supported ? (
              <div className="mt-8 rounded-[1.5rem] border border-white/12 bg-white/[0.055] p-5 text-sm leading-6 text-white/62">
                <p>{quote.reason}</p>
                <a className="button-primary mt-5" href="mailto:studio@postervalley.nl">
                  Contact us
                </a>
              </div>
            ) : (
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  className="button-primary payment-button justify-center"
                  disabled={!canPay}
                >
                  {submitting ? 'Starting payment...' : 'Confirm and pay'}
                </button>
                <p className="text-sm leading-6 text-white/46">
                  Payment is handled securely by Mollie Checkout.
                </p>
              </div>
            )}

            {errorMessage ? (
              <p className="mt-5 text-sm font-semibold leading-6 text-white/80">{errorMessage}</p>
            ) : null}
            {paymentMessage ? (
              <p className="mt-5 text-sm font-semibold leading-6 text-white/80">
                {paymentMessage}
              </p>
            ) : null}
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

function PaidConfirmationCard({
  posterTitle,
  quantity,
  total,
}: {
  posterTitle: string
  quantity: number
  total: string
}) {
  return (
    <div className="mt-12 rounded-[1.5rem] bg-ink p-5 text-paper shadow-2xl md:p-8">
      <p className="eyebrow text-white/42">Order confirmed</p>
      <h2 className="mt-5 font-heading text-5xl font-semibold leading-none tracking-[-0.055em]">
        Payment confirmed.
      </h2>
      <div className="mt-8 grid gap-4 text-sm leading-6 text-white/62 md:grid-cols-3">
        <ConfirmationItem label="Poster" value={posterTitle} />
        <ConfirmationItem label="Quantity" value={`${quantity}`} />
        <ConfirmationItem label="Total paid" value={total} />
      </div>
      <p className="mt-8 max-w-2xl text-base leading-7 text-white/62">
        We'll email you when your poster is ready to ship.
      </p>
      <a className="button-primary mt-8" href="/">
        Back to Poster Valley
      </a>
    </div>
  )
}

function ConfirmationItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-white/14 pt-4">
      <p className="eyebrow text-white/38">{label}</p>
      <p className="mt-2 text-lg font-semibold text-paper">{value}</p>
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-ink/12 pt-5">
      <p className="eyebrow text-ink/42">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
  required,
  readOnly,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  autoComplete?: string
  required?: boolean
  readOnly?: boolean
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        required={required}
        readOnly={readOnly}
      />
    </label>
  )
}
