import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, test } from 'node:test'

const saved = {
  fetch: globalThis.fetch,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  mollieKey: process.env.MOLLIE_API_KEY,
  siteUrl: process.env.SITE_URL,
}
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
process.env.MOLLIE_API_KEY = 'test_fixture_key'
process.env.SITE_URL = 'https://preview.postervalley.test'

const rawToken = 'pv_fixture_abcdefghijklmnopqrstuvwxyz012345'
const invitation = {
  id: '11111111-1111-4111-8111-111111111111',
  interest_request_id: '22222222-2222-4222-8222-222222222222',
  drop_id: 'drop_eurofighter_typhoon',
  drop_slug: 'eurofighter-typhoon',
  drop_title: 'Eurofighter Typhoon',
  email: 'ada@example.test',
  email_normalized: 'ada@example.test',
  first_name: 'Ada',
  last_name: 'Lovelace',
  quantity: 1,
  currency: 'EUR',
  unit_price: 17.75,
  subtotal_amount: 17.75,
  status: 'sent',
  token_hash: createHash('sha256').update(rawToken).digest('hex'),
  expires_at: '2099-01-01T00:00:00.000Z',
}
const orderId = '33333333-3333-4333-8333-333333333333'
const providerKey = '44444444-4444-4444-8444-444444444444'

const { default: paymentHandler } = await import('../api/create-payment.js?payment-idempotency')

after(() => {
  globalThis.fetch = saved.fetch
  for (const [name, value] of [
    ['SUPABASE_URL', saved.supabaseUrl],
    ['SUPABASE_SERVICE_ROLE_KEY', saved.supabaseKey],
    ['MOLLIE_API_KEY', saved.mollieKey],
    ['SITE_URL', saved.siteUrl],
  ]) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

function response() {
  return {
    statusCode: 0,
    payload: null,
    headers: {},
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers[name] = value; return this },
    end(body) { this.payload = JSON.parse(body) },
  }
}

function paymentRequest(overrides = {}) {
  return {
    method: 'POST',
    body: {
      token: rawToken,
      acceptedTerms: true,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: invitation.email,
      countryCode: 'NL',
      addressLine1: '1 Test Street',
      postalCode: '1015 CJ',
      city: 'Amsterdam',
      ...overrides,
    },
  }
}

function rpcError(message) {
  return new Response(JSON.stringify({ message }), { status: 400 })
}

function installHarness({
  providerMode = 'success',
  providerDelayMs = 0,
  existingPaymentStatus = null,
  invitationStatus = 'sent',
  invitationExpiresAt = invitation.expires_at,
} = {}) {
  const activeInvitation = { ...invitation, status: invitationStatus, expires_at: invitationExpiresAt }
  const state = {
    order: null,
    payment: null,
    providerCalls: 0,
    providerKeys: [],
    claimCalls: 0,
    completeCalls: 0,
  }

  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    const body = init.body ? JSON.parse(init.body) : null

    if (parsed.hostname === 'api.mollie.com') {
      state.providerCalls += 1
      state.providerKeys.push(init.headers['Idempotency-Key'])
      if (providerDelayMs) await new Promise((resolve) => setTimeout(resolve, providerDelayMs))
      if (providerMode === 'response-loss') throw new TypeError('Synthetic response loss')
      return new Response(JSON.stringify({
        id: 'tr_idempotentfixture',
        status: 'open',
        _links: { checkout: { href: 'https://checkout.test/tr_idempotentfixture' } },
      }))
    }

    if (parsed.pathname.endsWith('/order_invitations')) {
      return new Response(JSON.stringify([activeInvitation]))
    }

    if (parsed.pathname.endsWith('/rpc/payment_start_claim')) {
      state.claimCalls += 1
      if (!state.order) {
        if (!['draft', 'sent', 'opened', 'order_started', 'payment_open'].includes(activeInvitation.status)) {
          return rpcError('payment_invitation_unusable')
        }
        state.order = {
          id: orderId,
          requestHash: body.p_request_hash,
          claimId: body.p_claim_id,
          providerKey,
          paymentStartStatus: existingPaymentStatus ? 'provider_created' : 'claimed',
        }
        if (existingPaymentStatus) {
          state.payment = {
            status: existingPaymentStatus,
            checkoutUrl: existingPaymentStatus === 'open' ? 'https://checkout.test/existing' : null,
          }
        }
        return new Response(JSON.stringify({
          orderId,
          providerIdempotencyKey: providerKey,
          paymentStartStatus: state.order.paymentStartStatus,
          claimOwner: !existingPaymentStatus,
          paymentStatus: state.payment?.status ?? null,
          checkoutUrl: state.payment?.checkoutUrl ?? null,
        }))
      }
      if (state.order.requestHash !== body.p_request_hash) return rpcError('payment_idempotency_conflict')
      return new Response(JSON.stringify({
        orderId,
        providerIdempotencyKey: providerKey,
        paymentStartStatus: state.order.paymentStartStatus,
        claimOwner: false,
        paymentStatus: state.payment?.status ?? null,
        checkoutUrl: state.payment?.checkoutUrl ?? null,
      }))
    }

    if (parsed.pathname.endsWith('/rpc/payment_start_begin_provider')) {
      if (state.order.paymentStartStatus !== 'claimed' || state.order.claimId !== body.p_claim_id) {
        return new Response(JSON.stringify({ started: false, orderId, paymentStartStatus: state.order.paymentStartStatus, claimOwner: false, paymentStatus: state.payment?.status ?? null, checkoutUrl: state.payment?.checkoutUrl ?? null }))
      }
      state.order.paymentStartStatus = 'provider_pending'
      return new Response(JSON.stringify({ started: true, orderId, providerIdempotencyKey: providerKey, paymentStartStatus: 'provider_pending', claimOwner: true, paymentStatus: null, checkoutUrl: null }))
    }

    if (parsed.pathname.endsWith('/rpc/payment_start_complete')) {
      state.completeCalls += 1
      if (state.payment) {
        return new Response(JSON.stringify({ orderId, paymentStartStatus: state.order.paymentStartStatus, claimOwner: false, paymentStatus: state.payment.status, checkoutUrl: state.payment.checkoutUrl }))
      }
      state.order.paymentStartStatus = 'provider_created'
      state.payment = { status: body.p_payment_status, checkoutUrl: body.p_checkout_url }
      return new Response(JSON.stringify({ orderId, paymentStartStatus: 'provider_created', claimOwner: false, paymentStatus: state.payment.status, checkoutUrl: state.payment.checkoutUrl }))
    }

    if (parsed.pathname.endsWith('/rpc/payment_start_mark_reconciliation')) {
      state.order.paymentStartStatus = 'reconciliation_required'
      state.order.claimId = null
      return new Response(JSON.stringify({ orderId, paymentStartStatus: 'reconciliation_required', claimOwner: false, paymentStatus: null, checkoutUrl: null }))
    }

    throw new Error(`Unexpected request ${parsed.pathname} ${init.method}`)
  }

  return state
}

async function invoke(overrides = {}) {
  const res = response()
  await paymentHandler(paymentRequest(overrides), res)
  return res
}

test('sequential identical payment starts reuse one order, payment, checkout URL, and provider key', async () => {
  const state = installHarness()
  const first = await invoke()
  const second = await invoke()
  assert.equal(first.statusCode, 200)
  assert.equal(second.statusCode, 200)
  assert.equal(first.payload.checkoutUrl, 'https://checkout.test/tr_idempotentfixture')
  assert.equal(second.payload.checkoutUrl, first.payload.checkoutUrl)
  assert.equal(state.providerCalls, 1)
  assert.equal(state.completeCalls, 1)
  assert.deepEqual(state.providerKeys, [providerKey])
  assert.equal(state.claimCalls, 2)
})

test('concurrent identical starts serialize one provider call and converge on the canonical checkout', async () => {
  const state = installHarness({ providerDelayMs: 30 })
  const [first, concurrent] = await Promise.all([invoke(), invoke()])
  assert.equal(first.statusCode, 200)
  assert.equal(concurrent.statusCode, 202)
  assert.equal(concurrent.payload.paymentStatus, 'processing')
  const replay = await invoke()
  assert.equal(replay.statusCode, 200)
  assert.equal(replay.payload.checkoutUrl, first.payload.checkoutUrl)
  assert.equal(state.providerCalls, 1)
  assert.equal(state.completeCalls, 1)
})

test('provider response loss blocks blind retry and preserves the same persistent provider key', async () => {
  const state = installHarness({ providerMode: 'response-loss' })
  const first = await invoke()
  const retry = await invoke()
  assert.equal(first.statusCode, 500)
  assert.equal(retry.statusCode, 409)
  assert.match(retry.payload.error, /reconciliation/i)
  assert.equal(state.providerCalls, 1)
  assert.deepEqual(state.providerKeys, [providerKey])
  assert.equal(state.order.paymentStartStatus, 'reconciliation_required')
})

test('changed customer or economic input conflicts without overwrite or provider retry', async () => {
  const state = installHarness()
  const first = await invoke()
  const conflict = await invoke({ addressLine1: '2 Different Street' })
  assert.equal(first.statusCode, 200)
  assert.equal(conflict.statusCode, 409)
  assert.match(conflict.payload.error, /different order details/i)
  assert.equal(state.providerCalls, 1)
  assert.equal(state.completeCalls, 1)
})

test('existing payment states have explicit reuse or terminal behavior without duplicate create', async () => {
  const expected = {
    open: 200,
    paid: 200,
    failed: 409,
    expired: 409,
    canceled: 409,
    unknown: 409,
  }
  for (const [status, expectedStatusCode] of Object.entries(expected)) {
    const state = installHarness({ existingPaymentStatus: status })
    const result = await invoke()
    assert.equal(result.statusCode, expectedStatusCode, status)
    assert.equal(state.providerCalls, 0, status)
    if (status === 'open') assert.equal(result.payload.checkoutUrl, 'https://checkout.test/existing')
    if (status === 'paid') assert.equal(result.payload.paymentStatus, 'paid')
  }
})

test('paid, expired, and cancelled invitations cannot start a new provider payment', async () => {
  for (const status of ['paid', 'cancelled']) {
    const state = installHarness({ invitationStatus: status })
    const result = await invoke()
    assert.equal(result.statusCode, 409, status)
    assert.equal(state.providerCalls, 0, status)
  }
  const expired = installHarness({ invitationExpiresAt: '2000-01-01T00:00:00.000Z' })
  const result = await invoke()
  assert.equal(result.statusCode, 410)
  assert.equal(expired.providerCalls, 0)
})
