import assert from 'node:assert/strict'
import { after, test } from 'node:test'

const savedFetch = globalThis.fetch
const savedMollieKey = process.env.MOLLIE_API_KEY
const savedTestMode = process.env.MOLLIE_TEST_MODE
process.env.MOLLIE_API_KEY = 'test_fixture_key'
delete process.env.MOLLIE_TEST_MODE

const { createMolliePayment, getMolliePayment } = await import('../api/_mollie.js?mollie-idempotency')
const idempotencyKey = '11111111-1111-4111-8111-111111111111'
const payload = {
  amount: { currency: 'EUR', value: '23.70' },
  description: 'Poster Valley fixture',
  redirectUrl: 'https://preview.postervalley.test/order/fixture',
}

after(() => {
  globalThis.fetch = savedFetch
  if (savedMollieKey === undefined) delete process.env.MOLLIE_API_KEY
  else process.env.MOLLIE_API_KEY = savedMollieKey
  if (savedTestMode === undefined) delete process.env.MOLLIE_TEST_MODE
  else process.env.MOLLIE_TEST_MODE = savedTestMode
})

test('Mollie POST retries carry the exact stable Idempotency-Key while GET omits it', async () => {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers })
    return new Response(JSON.stringify(init.method === 'POST'
      ? { id: 'tr_fixture', status: 'open', _links: { checkout: { href: 'https://checkout.test/tr_fixture' } } }
      : { id: 'tr_fixture', status: 'open' }))
  }

  await createMolliePayment(payload, idempotencyKey)
  await createMolliePayment(payload, idempotencyKey)
  await getMolliePayment('tr_fixture')

  assert.equal(calls.length, 3)
  assert.equal(calls[0].headers['Idempotency-Key'], idempotencyKey)
  assert.equal(calls[1].headers['Idempotency-Key'], idempotencyKey)
  assert.equal('Idempotency-Key' in calls[2].headers, false)
  assert.equal(calls[0].headers.Authorization, 'Bearer test_fixture_key')
})

test('Mollie failures log only the status and never the authorization credential', async () => {
  const messages = []
  const savedConsoleError = console.error
  console.error = (...args) => messages.push(args.join(' '))
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'denied' }), { status: 401 })
  try {
    await assert.rejects(createMolliePayment(payload, idempotencyKey))
  } finally {
    console.error = savedConsoleError
  }
  assert.equal(messages.length, 1)
  assert.match(messages[0], /401/)
  assert.doesNotMatch(messages[0], /test_fixture_key|authorization|bearer/i)
})
