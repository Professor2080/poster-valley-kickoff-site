import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const savedFetch = globalThis.fetch
const savedUrl = process.env.SUPABASE_URL
const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'

const reservationId = '11111111-1111-4111-8111-111111111111'
const invitationId = '22222222-2222-4222-8222-222222222222'
const orderId = '33333333-3333-4333-8333-333333333333'
let tableReads = []
const orderRecord = { id: orderId, invitation_id: invitationId, interest_request_id: reservationId, drop_slug: 'eurofighter-typhoon', drop_title: 'Eurofighter Typhoon', status: 'paid', email: 'ada@example.test', first_name: 'Ada', last_name: 'Lovelace', shipping_name: 'Ada Lovelace', shipping_company: 'Analytical Engines', address_line1: '1 Test Street', address_line2: 'Floor 2', postal_code: '1015 CJ', city: 'Amsterdam', region: null, shipping_country: 'Netherlands', shipping_country_code: 'NL', fulfilment_status: 'ready_to_pack', fulfilment_version: 1, quantity: 1, currency: 'EUR', subtotal_amount: 17.75, shipping_amount: 5.95, total_amount: 23.7, created_at: '2026-07-21T08:10:00Z', updated_at: '2026-07-21T08:20:00Z' }
let reservationOrders = []
let paymentRecords = []

function response() { return { statusCode: 0, payload: null, headers: {}, status(code) { this.statusCode = code; return this }, setHeader(name, value) { this.headers[name] = value; return this }, end(body) { this.payload = JSON.parse(body) } } }
function request(resource, id, token = 'manager') { return { method: 'POST', body: { resource, id }, headers: token ? { authorization: `Bearer ${token}` } : {} } }

before(() => {
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/auth/v1/user') return new Response(JSON.stringify({ id: init.headers.Authorization.replace('Bearer ', '') }))
    if (parsed.pathname.endsWith('/admin_roles')) return new Response(JSON.stringify([{ role: parsed.searchParams.get('user_id').includes('operator') ? 'operator' : 'manager' }]))
    tableReads.push(parsed)
    const select = parsed.searchParams.get('select') ?? ''
    if (parsed.pathname.endsWith('/drop_interest_requests')) {
      if (select.includes('email')) return new Response(JSON.stringify([{ id: reservationId, created_at: '2026-07-21T08:00:00Z', drop_slug: 'eurofighter-typhoon', drop_title: 'Eurofighter Typhoon', first_name: 'Ada', last_name: 'Lovelace', full_name: 'Ada Lovelace', email: 'ada@example.test', country: 'Netherlands', country_code: 'NL', preferred_format: 'A2', quantity: 1, status: 'new', reservation_status: 'new', record_origin: 'test', record_origin_needs_review: false, record_origin_version: 1 }]))
      return new Response(JSON.stringify([{ id: reservationId, full_name: 'Ada Lovelace', record_origin: 'test', record_origin_needs_review: false, record_origin_version: 1 }]))
    }
    if (parsed.pathname.endsWith('/orders')) {
      if (select.includes('address_line1')) return new Response(JSON.stringify(parsed.searchParams.has('interest_request_id') ? reservationOrders : [orderRecord]))
      return new Response(JSON.stringify([]))
    }
    if (parsed.pathname.endsWith('/order_invitations')) return new Response(JSON.stringify(parsed.searchParams.has('id') ? [{ id: invitationId, interest_request_id: reservationId, status: 'paid' }] : []))
    if (parsed.pathname.endsWith('/payments')) return new Response(JSON.stringify(paymentRecords))
    return new Response(JSON.stringify([]), { headers: { 'content-range': '*/0' } })
  }
})

after(() => {
  globalThis.fetch = savedFetch
  if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl
  if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey
})

const { default: detailHandler } = await import('../api/admin/detail.js')

test('complete customer detail rejects unauthenticated users and operators before PII reads', async () => {
  for (const [token, expected] of [[null, 401], ['operator', 403]]) {
    tableReads = []; const res = response(); await detailHandler(request('reservations', reservationId, token), res)
    assert.equal(res.statusCode, expected); assert.equal(tableReads.length, 0)
  }
})

test('manager reservation detail returns full email but never a reservation shipping address', async () => {
  reservationOrders = []
  paymentRecords = []
  const res = response(); await detailHandler(request('reservations', reservationId), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.record.full_name, 'Ada Lovelace')
  assert.equal(res.payload.record.email, 'ada@example.test')
  for (const field of ['shipping_address', 'address_line1', 'postal_code', 'city']) assert.equal(field in res.payload.record, false)
  assert.equal(res.payload.fulfilment, null)
  assert.match(res.headers['Cache-Control'], /private, no-store/)
  assert.equal(res.headers.Vary, 'Authorization')
})

test('manager reservation detail adds a fulfilment address only when a related order exists', async () => {
  reservationOrders = [orderRecord]
  paymentRecords = [{ id: '44444444-4444-4444-8444-444444444444', order_id: orderId, provider: 'mollie', provider_payment_id: 'tr_confirmed', status: 'paid', amount: 23.7, currency: 'EUR', webhook_received_at: '2026-07-21T08:15:00Z', paid_at: '2026-07-21T08:15:00Z' }]
  const res = response(); await detailHandler(request('reservations', reservationId), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.fulfilment.shipping_name, 'Ada Lovelace')
  assert.equal(res.payload.fulfilment.address_line1, '1 Test Street')
  assert.equal('email' in res.payload.fulfilment, false)
  assert.equal('address_line1' in res.payload.history.orders[0], false)
  reservationOrders = []
  paymentRecords = []
})

test('reservation fulfilment chooses the provider-confirmed paid order over a newer failed attempt', async () => {
  const failedOrderId = '55555555-5555-4555-8555-555555555555'
  const unconfirmedOrderId = '66666666-6666-4666-8666-666666666666'
  reservationOrders = [
    { ...orderRecord, id: failedOrderId, status: 'payment_failed', address_line1: '99 Wrong Street', created_at: '2026-07-21T10:00:00Z' },
    { ...orderRecord, id: unconfirmedOrderId, address_line1: '88 Unconfirmed Street', created_at: '2026-07-21T09:00:00Z' },
    orderRecord,
  ]
  paymentRecords = [
    { id: '77777777-7777-4777-8777-777777777777', order_id: unconfirmedOrderId, provider: 'mollie', provider_payment_id: null, status: 'paid', amount: 23.7, currency: 'EUR', webhook_received_at: '2026-07-21T09:15:00Z', paid_at: '2026-07-21T09:15:00Z' },
    { id: '44444444-4444-4444-8444-444444444444', order_id: orderId, provider: 'mollie', provider_payment_id: 'tr_confirmed', status: 'paid', amount: 23.7, currency: 'EUR', webhook_received_at: '2026-07-21T08:15:00Z', paid_at: '2026-07-21T08:15:00Z' },
  ]
  const res = response(); await detailHandler(request('reservations', reservationId), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.fulfilment.order_id, orderId)
  assert.equal(res.payload.fulfilment.address_line1, '1 Test Street')
  reservationOrders = []
  paymentRecords = []
})

test('manager order detail returns the complete read-only fulfilment destination and confirmed payment history', async () => {
  paymentRecords = [{ id: '44444444-4444-4444-8444-444444444444', order_id: orderId, provider: 'mollie', provider_payment_id: 'tr_confirmed', status: 'paid', amount: 23.7, currency: 'EUR', webhook_received_at: '2026-07-21T08:15:00Z', paid_at: '2026-07-21T08:15:00Z' }]
  const res = response(); await detailHandler(request('orders', orderId), res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.record.shipping_name, 'Ada Lovelace')
  assert.equal(res.payload.record.shipping_company, 'Analytical Engines')
  assert.equal(res.payload.record.address_line1, '1 Test Street')
  assert.equal(res.payload.record.postal_code, '1015 CJ')
  assert.equal(res.payload.record.email, 'ada@example.test')
  assert.equal(res.payload.record.payment_status, 'paid')
  assert.equal(res.payload.history.payments[0].status, 'paid')
  assert.equal('provider_payment_id' in res.payload.history.payments[0], false)
  paymentRecords = []
})
