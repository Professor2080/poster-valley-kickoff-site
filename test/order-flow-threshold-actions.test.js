import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, confirmation: process.env.ADMIN_CONFIRMATION_SECRET }
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
process.env.ADMIN_CONFIRMATION_SECRET = 'confirmation-test-secret-at-least-32-bytes'

const actorId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const productCode = 'eurofighter-typhoon-a2'
const updatedAt = '2026-08-04T09:00:00.000Z'
let role = 'manager'
let calls = []
let replay = null

const { createAdminActionsHandler } = await import('../api/admin/actions.js?threshold-actions')

before(() => installFetch())
after(() => {
  globalThis.fetch = saved.fetch
  for (const [name, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_SERVICE_ROLE_KEY', saved.key], ['ADMIN_CONFIRMATION_SECRET', saved.confirmation]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value
  }
})

function response() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, setHeader() { return this }, end(value) { this.body = JSON.parse(value) } } }
async function invoke(body) { const res = response(); await createAdminActionsHandler()({ method: 'POST', body, headers: { authorization: 'Bearer valid' } }, res); return res }
const ok = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })

function installFetch() {
  calls = []; role = 'manager'; replay = null
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname
    if (path === '/auth/v1/user') return ok({ id: actorId })
    if (path === '/rest/v1/admin_roles') return ok([{ role }])
    const name = path.split('/').at(-1)
    const body = JSON.parse(init.body)
    calls.push({ name, body })
    if (name === 'admin_order_flow_preview_action') return ok({ success: true, preview: { productCode, dropTitle: 'Eurofighter Typhoon / A2', currentProductionThreshold: 5, productionThreshold: 7, qualifiedUnits: 4, thresholdReached: false, expectedUpdatedAt: updatedAt } })
    if (name === 'admin_a3_replay_action') return ok(replay ?? { found: false })
    if (name === 'admin_order_flow_set_threshold') return ok({ success: true, entityId: productCode, productionThreshold: 7, replay: false })
    throw new Error(`Unexpected RPC ${name}`)
  }
}

const previewBody = { action: 'drop.threshold.preview', productCode, productionThreshold: 7, expectedUpdatedAt: updatedAt }

test('threshold preview and mutation require a manager', async () => {
  installFetch(); role = 'operator'
  assert.equal((await invoke(previewBody)).statusCode, 403)
  assert.equal(calls.length, 0)
})

test('threshold input is validated before any RPC', async () => {
  installFetch()
  const result = await invoke({ ...previewBody, productionThreshold: 0 })
  assert.equal(result.statusCode, 400)
  assert.equal(result.body.error.code, 'invalid_threshold')
  assert.equal(calls.length, 0)
})

test('confirmed threshold change reuses confirmation, version and idempotency gates', async () => {
  installFetch()
  const reviewed = await invoke(previewBody)
  assert.equal(reviewed.statusCode, 200)
  assert.equal(reviewed.body.confirmation.action, 'drop.threshold.set')
  const applied = await invoke({ ...previewBody, action: 'drop.threshold.set', confirmationProof: reviewed.body.confirmation.proof, idempotencyKey: 'threshold-change-1' })
  assert.equal(applied.statusCode, 200)
  assert.equal(applied.body.productionThreshold, 7)
  const mutation = calls.find((call) => call.name === 'admin_order_flow_set_threshold')
  assert.deepEqual(mutation.body.p_request, { productCode, productionThreshold: 7, expectedUpdatedAt: updatedAt })
  assert.equal(typeof mutation.body.p_request_hash, 'string')
  assert.equal(mutation.body.p_request_hash.length, 64)
  assert.equal(mutation.body.p_confirmation_hash, mutation.body.p_request_hash)
})

test('completed same-key replay does not invoke the threshold mutation again', async () => {
  installFetch()
  const reviewed = await invoke(previewBody)
  replay = { found: true, result: { success: true, entityId: productCode, productionThreshold: 7 } }
  const applied = await invoke({ ...previewBody, action: 'drop.threshold.set', confirmationProof: reviewed.body.confirmation.proof, idempotencyKey: 'threshold-replay-1' })
  assert.equal(applied.body.replay, true)
  assert.equal(calls.some((call) => call.name === 'admin_order_flow_set_threshold'), false)
})
