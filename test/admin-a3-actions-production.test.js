import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, token: process.env.ADMIN_INVITATION_TOKEN_SECRET, confirmation: process.env.ADMIN_CONFIRMATION_SECRET, site: process.env.SITE_URL }
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
process.env.ADMIN_INVITATION_TOKEN_SECRET = 'dedicated-invitation-token-test-secret'
process.env.ADMIN_CONFIRMATION_SECRET = 'dedicated-confirmation-secret-longer-than-32-bytes'
process.env.SITE_URL = 'https://www.postervalley.nl'

const actorId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const reservationId = '11111111-1111-4111-8111-111111111111'
const invitationId = '22222222-2222-4222-8222-222222222222'
const attemptId = '44444444-4444-4444-8444-444444444444'
const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString()
let calls = []
let overrides = {}

const { createAdminActionsHandler } = await import('../api/admin/actions.js?production-contract-a32')
const { deriveInvitationToken, invitationTokenHash } = await import('../api/admin/_actions.js?production-contract-a32')

before(() => installSupabase())
after(() => { globalThis.fetch = saved.fetch; for (const [name, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_SERVICE_ROLE_KEY', saved.key], ['ADMIN_INVITATION_TOKEN_SECRET', saved.token], ['ADMIN_CONFIRMATION_SECRET', saved.confirmation], ['SITE_URL', saved.site]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value } })

function response() { return { statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, setHeader() { return this }, end(value) { this.body = JSON.parse(value) } } }
async function invoke(handler, body, token = 'valid') { const res = response(); await handler({ method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res); return res }
const ok = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
function invitationPreview(status = null) { return { success: true, preview: { reservationId, dropSlug: 'eurofighter-typhoon', dropTitle: 'Eurofighter Typhoon / A2', quantity: 1, reservationStatus: 'new', invitationId: status ? invitationId : null, invitationStatus: status, suggestedAction: status ? 'invitation.resend' : 'invitation.send', maskedRecipient: 'a***@example.test', previousDeliveryStatus: status ? 'sent' : null, previousDeliveryCompletedAt: null } } }

function installSupabase(next = {}) {
  calls = []; overrides = next
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname
    if (path === '/auth/v1/user') return ok({ id: actorId })
    if (path === '/rest/v1/admin_roles') return ok(overrides.role === null ? [] : [{ role: overrides.role ?? 'manager' }])
    const name = path.split('/').at(-1); const body = JSON.parse(init.body); calls.push({ name, body })
    if (overrides.rpc) { const overridden = await overrides.rpc(name, body); if (overridden !== undefined) return overridden?.error ? new Response(JSON.stringify({ message: overridden.error }), { status: 400 }) : ok(overridden) }
    if (name === 'admin_a32_preview_action') return ok(invitationPreview(overrides.invitationStatus))
    if (name === 'admin_a3_replay_action') return ok({ found: false })
    if (name === 'admin_a32_apply_action') return ok({ success: true, entityId: invitationId, emailAttemptId: attemptId, deliveryStatus: 'pending' })
    if (name === 'admin_a32_claim_delivery') return ok({ claimed: true })
    if (name === 'admin_a32_delivery_payload') {
      const action = overrides.invitationStatus ? 'invitation.resend' : 'invitation.send'
      const key = overrides.idempotencyKey ?? 'invitation-send-1'
      const token = deriveInvitationToken({ actorUserId: actorId, action, idempotencyKey: key, reservationId })
      return ok({ template: 'order_invitation', recipientEmail: 'ada@example.test', firstName: 'Ada', dropTitle: 'Eurofighter Typhoon / A2', expiresAt, reservationId, tokenActorUserId: actorId, tokenAction: action, tokenIdempotencyKey: key, tokenHash: invitationTokenHash(token) })
    }
    if (name === 'admin_a32_complete_delivery') return ok({ success: true, entityId: invitationId, emailAttemptId: attemptId, deliveryStatus: body.p_delivery_status })
    throw new Error(`Unexpected RPC ${name}`)
  }
}

async function preview(handler = createAdminActionsHandler()) { return invoke(handler, { action: 'invitation.preview', reservationId }) }
async function confirmed(handler, proof, action = 'invitation.send', key = 'invitation-send-1') { return invoke(handler, { action, reservationId, confirmationProof: proof, idempotencyKey: key }) }

test('actual handler requires an active manager and issues a payload-bound confirmation proof', async () => {
  installSupabase({ role: 'operator' })
  assert.equal((await preview()).statusCode, 403)
  installSupabase()
  const result = await preview()
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.confirmation.action, 'invitation.send')
  assert.match(result.body.confirmation.proof, /^pv-confirm-v1\./)
  assert.equal(result.body.confirmation.summary.destination, 'a***@example.test')
  assert.doesNotMatch(JSON.stringify(result.body), /ada@example\.test|pv_[A-Za-z0-9_-]+/)
})

test('actual handler rejects missing, mismatched, and stale confirmation before mutation', async () => {
  installSupabase()
  assert.equal((await confirmed(createAdminActionsHandler(), undefined)).body.error.code, 'confirmation_required')
  const reviewed = await preview()
  const mismatch = await confirmed(createAdminActionsHandler(), reviewed.body.confirmation.proof, 'invitation.resend')
  assert.equal(mismatch.body.error.code, 'confirmation_mismatch')
  installSupabase({ rpc: (name) => name === 'admin_a32_preview_action' ? invitationPreview('sent') : undefined })
  const stale = await confirmed(createAdminActionsHandler(), reviewed.body.confirmation.proof)
  assert.equal(stale.body.error.code, 'confirmation_stale')
})

test('confirmed invitation sends once with durable provider idempotency and no token at persistence boundaries', async () => {
  installSupabase()
  const handler = createAdminActionsHandler({ deliver: async (message) => ({ status: 'sent', providerId: message.idempotencyKey === `poster-valley-operational-${attemptId}` ? 'resend_message_1' : null }) })
  const reviewed = await preview(handler)
  const result = await confirmed(handler, reviewed.body.confirmation.proof)
  assert.equal(result.statusCode, 200)
  assert.equal(result.body.deliveryStatus, 'sent')
  const completion = calls.find((call) => call.name === 'admin_a32_complete_delivery')
  assert.equal(completion.body.p_provider_id, 'resend_message_1')
  assert.equal(completion.body.p_delivery_status, 'sent')
  assert.doesNotMatch(JSON.stringify(calls), /pv_[A-Za-z0-9_-]{20,}/)
  assert.doesNotMatch(JSON.stringify(result.body), /ada@example\.test|pv_[A-Za-z0-9_-]{20,}/)
})

test('ambiguous provider result stays pending and is not falsely completed', async () => {
  installSupabase()
  const handler = createAdminActionsHandler({ deliver: async () => ({ status: 'pending', providerId: null }) })
  const reviewed = await preview(handler)
  const result = await confirmed(handler, reviewed.body.confirmation.proof)
  assert.equal(result.statusCode, 202)
  assert.equal(result.body.deliveryStatus, 'pending')
  assert.equal(result.body.reconciliationRequired, true)
  assert.equal(calls.some((call) => call.name === 'admin_a32_complete_delivery'), false)
})

test('completed same-key replay never invokes the provider', async () => {
  let deliveries = 0
  installSupabase({ rpc: (name) => name === 'admin_a3_replay_action' ? { found: true, result: { success: true, entityId: invitationId, deliveryStatus: 'sent' } } : undefined })
  const handler = createAdminActionsHandler({ deliver: async () => { deliveries += 1; return { status: 'sent', providerId: 'duplicate' } } })
  const reviewed = await preview(handler)
  const result = await confirmed(handler, reviewed.body.confirmation.proof)
  assert.equal(result.body.replay, true)
  assert.equal(deliveries, 0)
  assert.equal(calls.some((call) => call.name === 'admin_a32_apply_action'), false)
})
