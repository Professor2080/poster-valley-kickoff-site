import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const savedSecret = process.env.ADMIN_ACTION_SECRET
process.env.ADMIN_ACTION_SECRET = 'test-admin-secret'
let fetchCalls = 0
const savedFetch = globalThis.fetch

function response() {
  return { statusCode: 0, payload: null, headers: {}, status(code) { this.statusCode = code; return this }, setHeader(name, value) { this.headers[name] = value; return this }, end(body) { this.payload = JSON.parse(body) } }
}
const request = (secret = 'test-admin-secret') => ({ method: 'POST', body: { token: 'pv_test_abcdefghijklmnopqrstuvwxyz' }, headers: secret ? { 'x-admin-action-secret': secret } : {} })

before(() => { globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Legacy sender must not call external services.') } })
after(() => {
  globalThis.fetch = savedFetch
  if (savedSecret === undefined) delete process.env.ADMIN_ACTION_SECRET
  else process.env.ADMIN_ACTION_SECRET = savedSecret
})

const { default: handler } = await import('../api/admin/send-order-invitation.js')

test('legacy invitation sender still rejects missing and incorrect secrets', async () => {
  for (const secret of [null, 'wrong']) {
    const res = response(); await handler(request(secret), res)
    assert.equal(res.statusCode, 401); assert.equal(res.payload.success, false)
  }
})

test('authenticated legacy invitation sender fails closed without delivery or mutation', async () => {
  const res = response(); await handler(request(), res)
  assert.equal(res.statusCode, 410)
  assert.match(res.payload.error, /legacy invitation sender is disabled/i)
  assert.equal(fetchCalls, 0)
})

test('legacy invitation sender remains POST-only', async () => {
  const res = response(); await handler({ method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'POST')
})
