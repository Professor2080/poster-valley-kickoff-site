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
const tokenHash = createHash('sha256').update(rawToken).digest('hex')
const invitation = {
  id: '11111111-1111-4111-8111-111111111111', interest_request_id: '22222222-2222-4222-8222-222222222222',
  drop_id: 'drop_eurofighter_typhoon', drop_slug: 'eurofighter-typhoon', drop_title: 'Eurofighter Typhoon',
  email: 'ada@example.test', email_normalized: 'ada@example.test', first_name: 'Ada', last_name: 'Lovelace',
  quantity: 1, currency: 'EUR', unit_price: 17.75, subtotal_amount: 17.75, status: 'sent',
  token_hash: tokenHash, expires_at: '2099-01-01T00:00:00.000Z', updated_at: '2026-07-20T10:00:00.000Z',
}
const manualQuote = { id: '33333333-3333-4333-8333-333333333333', invitation_id: invitation.id, country_code: 'US', currency: 'EUR', shipping_amount: 21.5, status: 'approved', expires_at: '2099-01-01T00:00:00.000Z' }

const { default: quoteHandler } = await import('../api/order-quote.js?public-a3')
const { default: paymentHandler } = await import('../api/create-payment.js?public-a3')
const { default: invitationHandler } = await import('../api/order-invitation.js?public-a3')

after(() => {
  globalThis.fetch = saved.fetch
  for (const [name, value] of [['SUPABASE_URL', saved.supabaseUrl], ['SUPABASE_SERVICE_ROLE_KEY', saved.supabaseKey], ['MOLLIE_API_KEY', saved.mollieKey], ['SITE_URL', saved.siteUrl]]) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

function response() {
  return { statusCode: 0, payload: null, headers: {}, status(code) { this.statusCode = code; return this }, setHeader(name, value) { this.headers[name] = value; return this }, end(body) { this.payload = JSON.parse(body) } }
}

test('automatic quote handler does not depend on the A3 manual-quote table', async () => {
  let manualReads = 0
  globalThis.fetch = async (url) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/order_invitations')) return new Response(JSON.stringify([invitation]))
    if (parsed.pathname.endsWith('/manual_shipping_quotes')) { manualReads += 1; throw new Error('Automatic quote must not read A3 table.') }
    throw new Error(`Unexpected request ${parsed.pathname}`)
  }
  const res = response()
  await quoteHandler({ method: 'POST', body: { token: rawToken, countryCode: 'NL' } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.quote.shipping, 5.95)
  assert.equal(manualReads, 0)
})

test('manual quote is snapshotted on the order before a mocked Mollie checkout is created', async () => {
  const calls = []
  let createdOrder = null
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url); const body = init.body ? JSON.parse(init.body) : null
    calls.push({ host: parsed.hostname, path: parsed.pathname, method: init.method, body })
    if (parsed.hostname === 'api.mollie.com') return new Response(JSON.stringify({ id: 'tr_mocked', status: 'open', _links: { checkout: { href: 'https://checkout.test/tr_mocked' } } }))
    if (parsed.pathname.endsWith('/order_invitations') && init.method === 'GET') return new Response(JSON.stringify([invitation]))
    if (parsed.pathname.endsWith('/manual_shipping_quotes')) return new Response(JSON.stringify([manualQuote]))
    if (parsed.pathname.endsWith('/orders') && init.method === 'POST') { createdOrder = { id: '44444444-4444-4444-8444-444444444444', ...body }; return new Response(JSON.stringify([createdOrder])) }
    if (parsed.pathname.endsWith('/payments') && init.method === 'POST') return new Response(JSON.stringify([{ id: 'payment-fixture', ...body }]))
    if ((parsed.pathname.endsWith('/orders') || parsed.pathname.endsWith('/order_invitations')) && init.method === 'PATCH') return new Response(JSON.stringify([{ ...body }]))
    throw new Error(`Unexpected request ${parsed.pathname} ${init.method}`)
  }
  const res = response()
  await paymentHandler({ method: 'POST', body: {
    token: rawToken, acceptedTerms: true, firstName: 'Ada', lastName: 'Lovelace', email: invitation.email,
    countryCode: 'US', company: 'Analytical Engines', addressLine1: '1 Test Street', postalCode: '12345', city: 'Test City', region: 'CA',
  } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.checkoutUrl, 'https://checkout.test/tr_mocked')
  assert.equal(createdOrder.manual_shipping_quote_id, manualQuote.id)
  assert.equal(createdOrder.shipping_company, 'Analytical Engines')
  assert.equal(createdOrder.shipping_amount, 21.5)
  assert.equal(createdOrder.total_amount, 39.25)
  assert.equal(createdOrder.metadata.manual_quote_id, manualQuote.id)
  assert.equal(createdOrder.metadata.manual_quote_expires_at, manualQuote.expires_at)
  const mollie = calls.find((call) => call.host === 'api.mollie.com')
  assert.equal(mollie.body.amount.value, '39.25')
})

test('public invitation summary uses the persisted order quote instead of recomputing a replaced quote', async () => {
  const order = {
    id: '44444444-4444-4444-8444-444444444444', invitation_id: invitation.id, status: 'payment_open',
    drop_title: invitation.drop_title, quantity: 1, currency: 'EUR', unit_price: 17.75, subtotal_amount: 17.75,
    shipping_amount: 21.5, total_amount: 39.25, shipping_profile_id: 'protected-a2', shipping_country: 'United States',
    shipping_country_code: 'US', manual_shipping_quote_id: manualQuote.id,
    metadata: { shipping_label: 'Approved manual shipping quote', shipping_note: 'Shipping quote approved by Poster Valley.' },
  }
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/order_invitations')) return new Response(JSON.stringify([{ ...invitation, status: 'order_started' }]))
    if (parsed.pathname.endsWith('/orders')) return new Response(JSON.stringify([order]))
    if (parsed.pathname.endsWith('/payments')) return new Response(JSON.stringify([]))
    throw new Error(`Unexpected request ${parsed.pathname} ${init.method}`)
  }
  const res = response()
  await invitationHandler({ method: 'POST', body: { token: rawToken } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.invitation.quote.supported, true)
  assert.equal(res.payload.invitation.quote.shipping, 21.5)
  assert.equal(res.payload.invitation.quote.manualQuoteId, manualQuote.id)
})
