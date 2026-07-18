import { PublicRequestError } from './_supabase.js'

const MOLLIE_API_KEY = process.env.MOLLIE_API_KEY
const MOLLIE_TEST_MODE = process.env.MOLLIE_TEST_MODE === 'true'
const MOLLIE_API_BASE = 'https://api.mollie.com/v2'

function hasModeSpecificApiKey() {
  return MOLLIE_API_KEY?.startsWith('test_') || MOLLIE_API_KEY?.startsWith('live_')
}

function requireMollie() {
  if (!MOLLIE_API_KEY) {
    throw new PublicRequestError('Payment is not configured yet.', 503)
  }
}

export function isMollieConfigured() {
  return Boolean(MOLLIE_API_KEY)
}

function withOptionalTestMode(payload) {
  if (!MOLLIE_TEST_MODE || hasModeSpecificApiKey()) {
    return payload
  }

  return {
    ...payload,
    testmode: true,
  }
}

async function mollieRequest(path, { method = 'GET', body } = {}) {
  requireMollie()

  const response = await fetch(`${MOLLIE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${MOLLIE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()

  if (!response.ok) {
    console.error(`Mollie request failed with ${response.status}.`)
    throw new PublicRequestError('Payment could not be started. Please try again later.', 502)
  }

  return text ? JSON.parse(text) : null
}

export async function createMolliePayment(payload) {
  const payment = await mollieRequest('/payments', {
    method: 'POST',
    body: withOptionalTestMode(payload),
  })

  const checkoutUrl = payment?._links?.checkout?.href

  if (!payment?.id || !checkoutUrl) {
    throw new PublicRequestError('Payment could not be started. Please try again later.', 502)
  }

  return {
    raw: payment,
    id: payment.id,
    status: payment.status,
    checkoutUrl,
  }
}

export async function getMolliePayment(paymentId) {
  const suffix = MOLLIE_TEST_MODE && !hasModeSpecificApiKey() ? '?testmode=true' : ''
  return mollieRequest(`/payments/${encodeURIComponent(paymentId)}${suffix}`)
}

export function mapMollieStatus(status) {
  if (status === 'paid') {
    return 'paid'
  }

  if (status === 'failed') {
    return 'failed'
  }

  if (status === 'expired') {
    return 'expired'
  }

  if (status === 'canceled') {
    return 'canceled'
  }

  if (status === 'open' || status === 'pending' || status === 'authorized') {
    return 'open'
  }

  return 'unknown'
}
