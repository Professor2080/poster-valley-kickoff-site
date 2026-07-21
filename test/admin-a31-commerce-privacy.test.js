import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const saved = {
  fetch: globalThis.fetch,
  warn: console.warn,
  error: console.error,
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  resend: process.env.RESEND_API_KEY,
  vercelResend: process.env.VERSEL_RESEND_API_KEY,
}
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-fixture'
delete process.env.RESEND_API_KEY
delete process.env.VERSEL_RESEND_API_KEY

const { PublicRequestError } = await import('../api/_supabase.js')
const { readShippingAddress } = await import('../api/_commerce.js')
const { default: interestHandler } = await import('../api/interest.js')

function response() {
  return { statusCode: 0, payload: null, headers: {}, status(code) { this.statusCode = code; return this }, setHeader(name, value) { this.headers[name] = value; return this }, end(body) { this.payload = JSON.parse(body) } }
}

before(() => { console.warn = () => {} })
after(() => {
  globalThis.fetch = saved.fetch; console.warn = saved.warn; console.error = saved.error
  for (const [name, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_SERVICE_ROLE_KEY', saved.key], ['RESEND_API_KEY', saved.resend], ['VERSEL_RESEND_API_KEY', saved.vercelResend]]) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('production address validator accepts reasonable NL and international destinations', () => {
  const nl = readShippingAddress({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', countryCode: 'NL', company: '', addressLine1: 'Keizersgracht 1', postalCode: '1015 CJ', city: 'Amsterdam' })
  assert.equal(nl.countryCode, 'NL'); assert.equal(nl.region, null); assert.equal(nl.company, null)
  const us = readShippingAddress({ firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.test', countryCode: 'US', company: 'Compiler Co', addressLine1: '1 Navy Way', postalCode: '10001-1234', city: 'New York', region: 'NY' })
  assert.equal(us.region, 'NY'); assert.equal(us.company, 'Compiler Co')
  const ca = readShippingAddress({ firstName: 'Viola', lastName: 'Desmond', email: 'viola@example.test', countryCode: 'CA', addressLine1: '10 Barrington St', postalCode: 'B3J 1Z9', city: 'Halifax', region: 'NS' })
  assert.equal(ca.postalCode, 'B3J 1Z9')
})

test('production address validator rejects fake countries, missing applicable region, bad postal and controls', () => {
  const base = { firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', addressLine1: '1 Test Street', postalCode: '12345', city: 'Test City' }
  for (const candidate of [
    { ...base, countryCode: 'ZZ' },
    { ...base, countryCode: 'US' },
    { ...base, countryCode: 'NL', postalCode: '12345' },
    { ...base, countryCode: 'FR', addressLine1: 'Rue\nInjectée' },
  ]) assert.throws(() => readShippingAddress(candidate), PublicRequestError)
})

test('public reservation handler ignores trusted-origin and address input and stores customer origin only', async () => {
  let inserted
  globalThis.fetch = async (_url, init = {}) => { inserted = JSON.parse(init.body); return new Response('', { status: 201 }) }
  const res = response()
  await interestHandler({ method: 'POST', body: {
    dropSlug: 'eurofighter-typhoon', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', country: 'Netherlands', quantity: 1,
    acceptedReservationTerms: true, marketingOptIn: false, sourcePath: '/drops/eurofighter-typhoon',
    recordOrigin: 'test', record_origin: 'internal_pilot', shippingAddress: 'must be ignored', addressLine1: 'must be ignored',
  } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(inserted.record_origin, 'customer')
  assert.equal(inserted.record_origin_needs_review, false)
  assert.equal(inserted.shipping_address, null)
  assert.equal('address_line1' in inserted, false)
})

test('public source paths cannot smuggle query data into notification URLs', async () => {
  let fetches = 0; globalThis.fetch = async () => { fetches += 1; return new Response('', { status: 201 }) }
  const res = response()
  await interestHandler({ method: 'POST', body: { dropSlug: 'eurofighter-typhoon', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', country: 'Netherlands', quantity: 1, acceptedReservationTerms: true, marketingOptIn: false, sourcePath: '/drop?email=ada@example.test' } }, res)
  assert.equal(res.statusCode, 400); assert.equal(fetches, 0)
})

test('raw database failures containing PII never reach logs or public errors', async () => {
  const leaked = 'ada@example.test 1 Secret Street'
  const logs = []
  console.error = (...args) => logs.push(JSON.stringify(args))
  globalThis.fetch = async () => new Response(JSON.stringify({ message: leaked }), { status: 400 })
  const res = response()
  await interestHandler({ method: 'POST', body: { dropSlug: 'eurofighter-typhoon', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test', country: 'Netherlands', quantity: 1, acceptedReservationTerms: true, marketingOptIn: false, sourcePath: '/drops/eurofighter-typhoon' } }, res)
  assert.equal(res.statusCode, 500)
  assert.doesNotMatch(JSON.stringify(logs), /ada@example\.test|Secret Street/)
  assert.doesNotMatch(JSON.stringify(res.payload), /ada@example\.test|Secret Street/)
})
