import assert from 'node:assert/strict'
import test from 'node:test'
import { operationalDeliveryAdapter } from '../api/_notifications.js'

test('operational invitation delivery is suppressed unless an adapter is injected', async () => {
  const deliver = operationalDeliveryAdapter()
  assert.deepEqual(await deliver({ to: 'fixture@example.test' }), { status: 'suppressed', providerId: null })
})
test('injected delivery adapter reports only confirmed provider acceptance', async () => {
  const sent = operationalDeliveryAdapter({ send: async () => ({ accepted: true, id: 'provider-fixture' }) })
  const failed = operationalDeliveryAdapter({ send: async () => ({ accepted: false }) })
  assert.deepEqual(await sent({}), { status: 'sent', providerId: 'provider-fixture' })
  assert.deepEqual(await failed({}), { status: 'failed', providerId: null })
})
test('delivery adapter does not send on suppressed retries', async () => {
  let calls = 0
  const deliver = operationalDeliveryAdapter()
  await Promise.all([deliver({}), deliver({})])
  assert.equal(calls, 0)
})
