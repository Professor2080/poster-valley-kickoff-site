import { createHash } from 'node:crypto'
import { getOrderableDropBySlug, getShippingProfile } from './_drops.js'
import { PublicRequestError, readEmail, readText } from './_supabase.js'

const finalInvitationStatuses = new Set(['paid', 'expired', 'cancelled'])
const reusablePaymentStatuses = new Set(['payment_failed', 'payment_expired', 'cancelled'])
const countryNameFormatter = new Intl.DisplayNames(['en'], { type: 'region' })

export function hashInvitationToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function readInvitationToken(value) {
  const token = readText(value, 'Invitation token', 160)

  if (!/^[A-Za-z0-9_-]{24,160}$/.test(token)) {
    throw new PublicRequestError('This order invitation link is not valid.', 404)
  }

  return token
}

export function isInvitationExpired(invitation) {
  return invitation?.expires_at ? new Date(invitation.expires_at).getTime() < Date.now() : false
}

export function canUseInvitation(invitation) {
  if (!invitation || finalInvitationStatuses.has(invitation.status)) {
    return false
  }

  if (isInvitationExpired(invitation)) {
    return false
  }

  return true
}

export function canStartPayment(invitation) {
  if (!canUseInvitation(invitation)) {
    return false
  }

  return (
    !invitation.status ||
    ['draft', 'sent', 'opened', 'order_started', 'payment_open'].includes(invitation.status) ||
    reusablePaymentStatuses.has(invitation.status)
  )
}

export function getCountryName(countryCode) {
  return countryNameFormatter.of(countryCode) ?? countryCode
}

export function normalizeCountryCode(value) {
  const countryCode = readText(value, 'Country', 2).toUpperCase()

  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new PublicRequestError('Please select a valid country.')
  }

  return countryCode
}

export function toCents(amount) {
  return Math.round(Number(amount) * 100)
}

export function fromCents(cents) {
  return Math.round(cents) / 100
}

export function formatMoney(amount, currency = 'EUR') {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(amount))
}

export function mollieAmountValue(amount) {
  return Number(amount).toFixed(2)
}

export function getInvitationDrop(invitation) {
  const drop = getOrderableDropBySlug(invitation.drop_slug)

  if (!drop) {
    throw new PublicRequestError('This poster is not available for order confirmation.', 404)
  }

  return drop
}

export function quoteForInvitation(invitation, countryCode) {
  const drop = getInvitationDrop(invitation)
  const shippingProfile = getShippingProfile(drop.shippingProfileId)

  if (!shippingProfile) {
    throw new PublicRequestError('Shipping is not configured for this poster.', 500)
  }

  const normalizedCountryCode = normalizeCountryCode(countryCode)
  const quantity = Number(invitation.quantity)
  const unitCents = toCents(invitation.unit_price ?? drop.basePrice)
  const subtotalCents = unitCents * quantity
  const unsupported = shippingProfile.unsupportedCountries.includes(normalizedCountryCode)

  if (unsupported) {
    return {
      supported: false,
      reason:
        'Shipping to this country is not available through this checkout yet. Please contact Poster Valley.',
      currency: invitation.currency ?? drop.currency,
      countryCode: normalizedCountryCode,
      countryName: getCountryName(normalizedCountryCode),
      quantity,
      unitPrice: fromCents(unitCents),
      subtotal: fromCents(subtotalCents),
      shipping: null,
      total: null,
      shippingProfileId: shippingProfile.id,
      shippingLabel: null,
      shippingNote: 'Manual shipping review required.',
      reviewNeeded: shippingProfile.reviewNeeded,
    }
  }

  const rate =
    shippingProfile.rates.find((candidate) =>
      candidate.countries?.includes(normalizedCountryCode),
    ) ?? shippingProfile.rates.find((candidate) => candidate.region === 'world')

  if (!rate) {
    throw new PublicRequestError('Shipping is not configured for this country.', 400)
  }

  const shippingCents = toCents(rate.amount)
  const totalCents = subtotalCents + shippingCents

  return {
    supported: true,
    currency: invitation.currency ?? drop.currency,
    countryCode: normalizedCountryCode,
    countryName: getCountryName(normalizedCountryCode),
    quantity,
    unitPrice: fromCents(unitCents),
    subtotal: fromCents(subtotalCents),
    shipping: fromCents(shippingCents),
    total: fromCents(totalCents),
    shippingProfileId: shippingProfile.id,
    shippingLabel: rate.label,
    shippingNote: rate.note,
    reviewNeeded: shippingProfile.reviewNeeded,
  }
}

export function readShippingAddress(body) {
  const firstName = readText(body.firstName, 'First name', 120)
  const lastName = readText(body.lastName, 'Last name', 120)
  const email = readEmail(body.email)
  const countryCode = normalizeCountryCode(body.countryCode)
  const addressLine1 = readText(body.addressLine1, 'Address line 1', 240)
  const addressLine2 = readText(body.addressLine2, 'Address line 2', 240, { required: false })
  const postalCode = readText(body.postalCode, 'Postal code', 40)
  const city = readText(body.city, 'City', 120)
  const region = readText(body.region, 'Region', 120, { required: false })

  return {
    firstName,
    lastName,
    email,
    countryCode,
    countryName: getCountryName(countryCode),
    shippingName: `${firstName} ${lastName}`,
    addressLine1,
    addressLine2,
    postalCode,
    city,
    region,
  }
}

export function publicOrderSummary(invitation, quote, latestOrder = null, latestPayment = null) {
  const drop = getInvitationDrop(invitation)

  return {
    status: isInvitationExpired(invitation) ? 'expired' : invitation.status,
    canOrder: canStartPayment(invitation),
    expiresAt: invitation.expires_at,
    drop: {
      id: drop.id,
      slug: drop.slug,
      title: drop.title,
      format: drop.format,
      dimensionsLabel: drop.dimensionsLabel,
      image: '/posters/first-drop-preview.webp',
      currency: drop.currency,
      shippingSummary: drop.shippingSummary,
    },
    customer: {
      firstName: invitation.first_name,
      lastName: invitation.last_name,
      email: invitation.email,
    },
    quantity: Number(invitation.quantity),
    unitPrice: Number(invitation.unit_price),
    subtotal: Number(invitation.subtotal_amount),
    quote,
    order: latestOrder
      ? {
          status: latestOrder.status,
          total: latestOrder.total_amount,
          shippingCountry: latestOrder.shipping_country,
          shippingCountryCode: latestOrder.shipping_country_code,
        }
      : null,
    payment: latestPayment
      ? {
          status: latestPayment.status,
          amount: latestPayment.amount,
          currency: latestPayment.currency,
        }
      : null,
  }
}
