import assert from 'node:assert/strict'
import { after, beforeEach, test } from 'node:test'

const savedFetch = globalThis.fetch
const savedUrl = process.env.SUPABASE_URL
const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const savedConfirmation = process.env.ADMIN_CONFIRMATION_SECRET
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
process.env.ADMIN_CONFIRMATION_SECRET = 'origin-confirmation-test-secret-at-least-32-bytes'

const reservationId = '11111111-1111-4111-8111-111111111111'
let rpcCalls = []
let completed = new Map()

function response() { return { statusCode: 0, payload: null, headers: {}, status(code) { this.statusCode = code; return this }, setHeader(name, value) { this.headers[name] = value; return this }, end(body) { this.payload = JSON.parse(body) } } }
function request(body, token = 'manager') { return { method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} } }

beforeEach(() => {
  rpcCalls = []; completed = new Map()
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/auth/v1/user') return new Response(JSON.stringify({ id: init.headers.Authorization.replace('Bearer ', '') }))
    if (parsed.pathname.endsWith('/admin_roles')) return new Response(JSON.stringify([{ role: parsed.searchParams.get('user_id').includes('operator') ? 'operator' : 'manager' }]))
    if (!parsed.pathname.includes('/rpc/')) throw new Error(`Unexpected request ${parsed.pathname}`)
    const name = parsed.pathname.split('/').at(-1); const body = JSON.parse(init.body); rpcCalls.push({ name, body })
    if (name === 'admin_a31_preview_origin_change') return new Response(JSON.stringify({ success: true, preview: { reservationId, previousOrigin: 'customer', newOrigin: body.p_new_origin, originVersion: 2, reason: body.p_reason, affectedRecords: { reservations: 1, invitations: 1, orders: 1, payments: 1, emails: 2 }, actionAllowed: true } }))
    if (name === 'admin_a3_replay_action') {
      const prior = completed.get(body.p_idempotency_key)
      if (!prior) return new Response(JSON.stringify({ found: false }))
      if (prior.hash !== body.p_request_hash) return new Response(JSON.stringify({ message: 'idempotency_conflict' }), { status: 400 })
      return new Response(JSON.stringify({ found: true, result: prior.result }))
    }
    if (name === 'admin_a32_change_origin') {
      const result = { success: true, entityId: reservationId, recordOrigin: body.p_new_origin, recordOriginNeedsReview: false, recordOriginVersion: body.p_expected_version + 1, affectedRecords: { reservations: 1, invitations: 1, orders: 1, payments: 1, emails: 2 }, replay: false }
      completed.set(body.p_idempotency_key, { hash: body.p_request_hash, result })
      return new Response(JSON.stringify(result))
    }
    throw new Error(`Unexpected RPC ${name}`)
  }
})

after(() => {
  globalThis.fetch = savedFetch
  if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl
  if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey
  if (savedConfirmation === undefined) delete process.env.ADMIN_CONFIRMATION_SECRET; else process.env.ADMIN_CONFIRMATION_SECRET = savedConfirmation
})

const { default: handler } = await import('../api/admin/actions.js')

test('origin preview requires manager role, a reason and a version before its RPC', async () => {
  const missing = response(); await handler(request({ action: 'origin.preview', reservationId, recordOrigin: 'test', expectedOriginVersion: 2, reason: '' }), missing)
  assert.equal(missing.statusCode, 400); assert.equal(rpcCalls.length, 0)
  const piiReason = response(); await handler(request({ action: 'origin.preview', reservationId, recordOrigin: 'test', expectedOriginVersion: 2, reason: 'Customer ada@example.test asked for this.' }), piiReason)
  assert.equal(piiReason.statusCode, 400); assert.equal(rpcCalls.length, 0)
  const operator = response(); await handler(request({ action: 'origin.preview', reservationId, recordOrigin: 'test', expectedOriginVersion: 2, reason: 'Reserved test fixture.' }, 'operator'), operator)
  assert.equal(operator.statusCode, 403); assert.equal(rpcCalls.length, 0)
})

test('manager origin preview is non-mutating and reports downstream impact', async () => {
  const res = response(); await handler(request({ action: 'origin.preview', reservationId, recordOrigin: 'internal_pilot', expectedOriginVersion: 2, reason: 'Owner-confirmed pilot chain.' }), res)
  assert.equal(res.statusCode, 200); assert.equal(res.payload.preview.affectedRecords.payments, 1)
  assert.match(res.payload.confirmation.proof, /^pv-confirm-v1\./)
  assert.deepEqual(rpcCalls.map((call) => call.name), ['admin_a31_preview_origin_change'])
})

async function reviewedProof(payload) {
  const reviewed = response(); await handler(request({ ...payload, action: 'origin.preview' }), reviewed)
  assert.equal(reviewed.statusCode, 200)
  return reviewed.payload.confirmation.proof
}

test('origin change requires explicit confirmation and keeps a stable idempotent replay', async () => {
  const payload = { action: 'origin.change', reservationId, recordOrigin: 'test', expectedOriginVersion: 2, reason: 'Reserved .test fixture.', idempotencyKey: 'origin-fixture-001' }
  const unconfirmed = response(); await handler(request(payload), unconfirmed)
  assert.equal(unconfirmed.statusCode, 409); assert.equal(rpcCalls.length, 0)
  const confirmationProof = await reviewedProof(payload)
  const first = response(); await handler(request({ ...payload, confirmationProof }), first)
  const replay = response(); await handler(request({ ...payload, confirmationProof }), replay)
  assert.equal(first.statusCode, 200); assert.equal(first.payload.recordOrigin, 'test')
  assert.equal(replay.statusCode, 200); assert.equal(replay.payload.replay, true)
  assert.equal(rpcCalls.filter((call) => call.name === 'admin_a32_change_origin').length, 1)
})

test('same origin idempotency key with changed payload is rejected as a conflict', async () => {
  const base = { action: 'origin.change', reservationId, expectedOriginVersion: 2, reason: 'Reserved .test fixture.', idempotencyKey: 'origin-fixture-002' }
  const firstPayload = { ...base, recordOrigin: 'test' }; const firstProof = await reviewedProof(firstPayload)
  const first = response(); await handler(request({ ...firstPayload, confirmationProof: firstProof }), first)
  const changedPayload = { ...base, recordOrigin: 'internal_pilot' }; const changedProof = await reviewedProof(changedPayload)
  const conflict = response(); await handler(request({ ...changedPayload, confirmationProof: changedProof }), conflict)
  assert.equal(first.statusCode, 200); assert.equal(conflict.statusCode, 409); assert.equal(conflict.payload.error.code, 'idempotency_conflict')
})
