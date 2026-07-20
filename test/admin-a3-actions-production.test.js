import assert from 'node:assert/strict'
import { after, test } from 'node:test'

const originalFetch = globalThis.fetch
const originalUrl = process.env.SUPABASE_URL
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const originalTokenSecret = process.env.ADMIN_INVITATION_TOKEN_SECRET
const originalSiteUrl = process.env.SITE_URL

process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
process.env.ADMIN_INVITATION_TOKEN_SECRET = 'dedicated-invitation-token-test-secret'
process.env.SITE_URL = 'https://preview.postervalley.test'

const actorId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const reservationId = '11111111-1111-4111-8111-111111111111'
const invitationId = '22222222-2222-4222-8222-222222222222'
const orderId = '33333333-3333-4333-8333-333333333333'
const attemptId = '44444444-4444-4444-8444-444444444444'
const invitationUpdatedAt = '2026-07-20T10:00:00.000Z'
const quoteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

const { createAdminActionsHandler } = await import('../api/admin/actions.js?production-contract')
const { deriveInvitationToken, invitationTokenHash } = await import('../api/admin/_actions.js?production-contract')

after(() => {
  globalThis.fetch = originalFetch
  restoreEnv('SUPABASE_URL', originalUrl)
  restoreEnv('SUPABASE_SERVICE_ROLE_KEY', originalServiceKey)
  restoreEnv('ADMIN_INVITATION_TOKEN_SECRET', originalTokenSecret)
  restoreEnv('SITE_URL', originalSiteUrl)
})

function restoreEnv(name, value) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

function response() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers[name] = value; return this },
    end(value) { this.body = JSON.parse(value) },
  }
}

function request(body, token = 'valid-session') {
  return { method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }
}

async function invoke(handler, body, token = 'valid-session') {
  const res = response()
  await handler(request(body, token), res)
  return res
}

function rpcSuccess(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

function installSupabase({ role = 'manager', replay = { found: false }, claim = { claimed: true }, onRpc = () => ({ success: true }) } = {}) {
  const calls = []
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/auth/v1/user') return rpcSuccess({ id: actorId })
    if (parsed.pathname === '/rest/v1/admin_roles') return rpcSuccess(role ? [{ role }] : [])
    const match = parsed.pathname.match(/^\/rest\/v1\/rpc\/(.+)$/)
    if (!match) throw new Error(`Unexpected request: ${parsed.pathname}`)
    const body = JSON.parse(init.body)
    calls.push({ name: match[1], body })
    const result = match[1] === 'admin_a3_replay_action' ? (typeof replay === 'function' ? await replay(body, calls) : replay)
      : match[1] === 'admin_a3_claim_delivery' ? (typeof claim === 'function' ? await claim(body, calls) : claim)
        : await onRpc(match[1], body, calls)
    if (result?.httpError) return new Response(JSON.stringify({ message: result.httpError }), { status: result.status ?? 400 })
    return rpcSuccess(result)
  }
  return calls
}

function invitationPreview() {
  return {
    success: true,
    preview: {
      reservationId,
      dropSlug: 'eurofighter-typhoon',
      quantity: 1,
      reservationStatus: 'new',
      invitationId: null,
      invitationStatus: null,
      suggestedAction: 'invitation.send',
    },
  }
}

function manualQuotePreview(countryCode = 'US') {
  return {
    success: true,
    preview: {
      invitationId,
      invitationStatus: 'sent',
      dropSlug: 'eurofighter-typhoon',
      quantity: 1,
      unitPrice: 17.75,
      currency: 'EUR',
      countryCode,
      shippingAmount: 21.5,
      expiresAt: quoteExpiresAt,
    },
  }
}

const invitationSendBody = {
  action: 'invitation.send',
  reservationId,
  confirmation: 'CONFIRM',
  idempotencyKey: 'invite-send-0001',
}
const invitationToken = deriveInvitationToken({ actorUserId: actorId, action: invitationSendBody.action, idempotencyKey: invitationSendBody.idempotencyKey, reservationId })

test('production handler enforces authentication, manager authorization, preview, and confirmation', async (t) => {
  await t.test('rejects an unauthenticated preview before any Supabase request', async () => {
    let fetches = 0
    globalThis.fetch = async () => { fetches += 1; throw new Error('must not fetch') }
    const res = await invoke(createAdminActionsHandler(), { action: 'invitation.preview', reservationId }, null)
    assert.equal(res.statusCode, 401)
    assert.equal(res.body.error.code, 'unauthenticated')
    assert.equal(fetches, 0)
  })

  await t.test('denies manager-only quote preview to an operator before RPC', async () => {
    const calls = installSupabase({ role: 'operator' })
    const res = await invoke(createAdminActionsHandler(), {
      action: 'quote.preview', invitationId, countryCode: 'US', shippingAmount: 21.5,
      expiresAt: quoteExpiresAt, expectedInvitationUpdatedAt: invitationUpdatedAt,
    })
    assert.equal(res.statusCode, 403)
    assert.equal(res.body.error.code, 'insufficient_role')
    assert.equal(calls.length, 0)
  })

  await t.test('runs a read-only invitation preview without confirmation or idempotency key', async () => {
    const calls = installSupabase({ role: 'operator', onRpc: (name) => {
      assert.equal(name, 'admin_a3_preview_action')
      return invitationPreview()
    } })
    const res = await invoke(createAdminActionsHandler(), { action: 'invitation.preview', reservationId })
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.preview.reservationId, reservationId)
    assert.deepEqual(calls.map(({ name }) => name), ['admin_a3_preview_action'])
    assert.equal(calls[0].body.p_actor, actorId)
    assert.equal(calls[0].body.p_action, 'invitation.preview')
  })

  await t.test('rejects a mutation without explicit confirmation before preview or apply RPC', async () => {
    const calls = installSupabase({ role: 'operator' })
    const res = await invoke(createAdminActionsHandler(), { ...invitationSendBody, confirmation: '' })
    assert.equal(res.statusCode, 409)
    assert.equal(res.body.error.code, 'confirmation_required')
    assert.equal(calls.length, 0)
  })
})

test('production invitation action records truthful delivery outcomes without exposing plaintext tokens', async (t) => {
  for (const deliveryStatus of ['suppressed', 'failed', 'sent']) {
    await t.test(deliveryStatus, async () => {
      const deliveryCalls = []
      const calls = installSupabase({ role: 'operator', onRpc: (name) => {
        if (name === 'admin_a3_preview_action') return invitationPreview()
        if (name === 'admin_a3_apply_action') return { success: true, entityId: invitationId, emailAttemptId: attemptId, deliveryStatus: 'pending', replay: false }
        if (name === 'admin_a3_delivery_payload') return {
          template: 'order_invitation', recipientEmail: 'customer@example.test', firstName: 'Ada',
          dropTitle: 'Eurofighter Typhoon / A2', expiresAt: quoteExpiresAt, reservationId,
          tokenActorUserId: actorId, tokenAction: invitationSendBody.action, tokenIdempotencyKey: invitationSendBody.idempotencyKey,
          tokenHash: invitationTokenHash(invitationToken),
        }
        if (name === 'admin_a3_complete_delivery') return { success: true, entityId: invitationId, emailAttemptId: attemptId, deliveryStatus, replay: false }
        throw new Error(`Unexpected RPC ${name}`)
      } })
      const handler = createAdminActionsHandler({ deliver: async (message) => {
        deliveryCalls.push(message)
        return { status: deliveryStatus, providerId: deliveryStatus === 'sent' ? 'provider-message-1' : null }
      } })
      const res = await invoke(handler, invitationSendBody)

      assert.equal(res.statusCode, 200)
      assert.equal(res.body.deliveryStatus, deliveryStatus)
      assert.equal(deliveryCalls.length, 1)
      assert.equal(deliveryCalls[0].idempotencyKey, `poster-valley-operational-${attemptId}`)
      assert.match(deliveryCalls[0].text, /\/order\/pv_[A-Za-z0-9_-]+/)

      const apply = calls.find(({ name }) => name === 'admin_a3_apply_action')
      assert.match(apply.body.p_context.tokenHash, /^[a-f0-9]{64}$/)
      assert.ok(new Date(apply.body.p_context.expiresAt).valueOf() > Date.now())
      const completion = calls.find(({ name }) => name === 'admin_a3_complete_delivery')
      assert.equal(completion.body.p_delivery_status, deliveryStatus)
      assert.equal(completion.body.p_provider_id, deliveryStatus === 'sent' ? 'provider-message-1' : null)

      const serializedRpc = JSON.stringify(calls)
      assert.doesNotMatch(serializedRpc, /pv_[A-Za-z0-9_-]{20,}/, 'plaintext token crossed the RPC boundary')
      assert.doesNotMatch(JSON.stringify(res.body), /pv_[A-Za-z0-9_-]{20,}/, 'plaintext token leaked in the response')
    })
  }
})

test('production handler preserves replay and conflict semantics', async (t) => {
  await t.test('returns a completed replay without invoking delivery again', async () => {
    let deliveries = 0
    const calls = installSupabase({ role: 'operator', replay: { found: true, result: { success: true, entityId: invitationId, deliveryStatus: 'sent' } } })
    const res = await invoke(createAdminActionsHandler({ deliver: async () => { deliveries += 1; return { status: 'sent', providerId: 'duplicate' } } }), invitationSendBody)
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.replay, true)
    assert.equal(res.body.deliveryStatus, 'sent')
    assert.equal(deliveries, 0)
    assert.deepEqual(calls.map(({ name }) => name), ['admin_a3_replay_action'])
  })

  await t.test('maps a database payload-hash conflict to a retryable HTTP conflict', async () => {
    const calls = installSupabase({ role: 'operator', replay: { httpError: 'idempotency_conflict', status: 400 } })
    const res = await invoke(createAdminActionsHandler(), invitationSendBody)
    assert.equal(res.statusCode, 409)
    assert.equal(res.body.error.code, 'idempotency_conflict')
    assert.deepEqual(calls.map(({ name }) => name), ['admin_a3_replay_action'])
  })
})

test('concurrent same-key handlers allow only one delivery dispatch', async () => {
  let claimed = false
  let deliveries = 0
  let releaseDelivery
  let deliveryStarted
  const started = new Promise((resolve) => { deliveryStarted = resolve })
  const release = new Promise((resolve) => { releaseDelivery = resolve })
  installSupabase({
    role: 'operator',
    claim: () => {
      if (claimed) return { httpError: 'operation_in_progress', status: 400 }
      claimed = true
      return { claimed: true }
    },
    onRpc: (name) => {
      if (name === 'admin_a3_preview_action') return invitationPreview()
      if (name === 'admin_a3_apply_action') return { success: true, entityId: invitationId, emailAttemptId: attemptId, deliveryStatus: 'pending', replay: false }
      if (name === 'admin_a3_delivery_payload') return {
        template: 'order_invitation', recipientEmail: 'customer@example.test', firstName: 'Ada', dropTitle: 'Eurofighter Typhoon / A2',
        expiresAt: quoteExpiresAt, reservationId, tokenActorUserId: actorId, tokenAction: invitationSendBody.action,
        tokenIdempotencyKey: invitationSendBody.idempotencyKey, tokenHash: invitationTokenHash(invitationToken),
      }
      if (name === 'admin_a3_complete_delivery') return { success: true, entityId: invitationId, emailAttemptId: attemptId, deliveryStatus: 'suppressed', replay: false }
      throw new Error(`Unexpected RPC ${name}`)
    },
  })
  const handler = createAdminActionsHandler({ deliver: async () => {
    deliveries += 1
    deliveryStarted()
    await release
    return { status: 'suppressed', providerId: null }
  } })
  const first = invoke(handler, invitationSendBody)
  await started
  const second = await invoke(handler, invitationSendBody)
  releaseDelivery()
  const firstResult = await first
  assert.equal(firstResult.statusCode, 200)
  assert.equal(second.statusCode, 409)
  assert.equal(second.body.error.code, 'operation_in_progress')
  assert.equal(deliveries, 1)
})

test('a pending invitation attempt fails closed when its token secret no longer matches', async () => {
  let deliveries = 0
  let completionStatus = null
  installSupabase({ role: 'operator', onRpc: (name, body) => {
    if (name === 'admin_a3_preview_action') return invitationPreview()
    if (name === 'admin_a3_apply_action') return { success: true, entityId: invitationId, emailAttemptId: attemptId, deliveryStatus: 'pending', replay: true }
    if (name === 'admin_a3_delivery_payload') return {
      template: 'order_invitation', recipientEmail: 'customer@example.test', firstName: 'Ada', dropTitle: 'Eurofighter Typhoon / A2',
      expiresAt: quoteExpiresAt, reservationId, tokenActorUserId: actorId, tokenAction: invitationSendBody.action,
      tokenIdempotencyKey: invitationSendBody.idempotencyKey, tokenHash: '0'.repeat(64),
    }
    if (name === 'admin_a3_complete_delivery') { completionStatus = body.p_delivery_status; return { success: true, emailAttemptId: attemptId, deliveryStatus: 'failed', replay: false } }
    throw new Error(`Unexpected RPC ${name}`)
  } })
  const res = await invoke(createAdminActionsHandler({ deliver: async () => { deliveries += 1; return { status: 'sent', providerId: 'must-not-send' } } }), invitationSendBody)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.deliveryStatus, 'failed')
  assert.equal(completionStatus, 'failed')
  assert.equal(deliveries, 0)
})

test('production handler validates quote and fulfilment contracts before mutation', async (t) => {
  await t.test('rejects an invalid quote amount without authentication or RPC work', async () => {
    let fetches = 0
    globalThis.fetch = async () => { fetches += 1; throw new Error('must not fetch') }
    const res = await invoke(createAdminActionsHandler(), {
      action: 'quote.approve', invitationId, countryCode: 'US', shippingAmount: 1.001,
      expiresAt: quoteExpiresAt, expectedInvitationUpdatedAt: invitationUpdatedAt,
      confirmation: 'CONFIRM', idempotencyKey: 'quote-approve-1',
    })
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error.code, 'invalid_request')
    assert.equal(fetches, 0)
  })

  await t.test('rejects a manager quote for an automatically priced destination before apply', async () => {
    const calls = installSupabase({ role: 'manager', onRpc: (name) => {
      assert.equal(name, 'admin_a3_preview_action')
      return manualQuotePreview('NL')
    } })
    const res = await invoke(createAdminActionsHandler(), {
      action: 'quote.approve', invitationId, countryCode: 'NL', shippingAmount: 21.5,
      expiresAt: quoteExpiresAt, expectedInvitationUpdatedAt: invitationUpdatedAt,
      confirmation: 'CONFIRM', idempotencyKey: 'quote-approve-2',
    })
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error.code, 'invalid_quote_destination')
    assert.deepEqual(calls.map(({ name }) => name), ['admin_a3_replay_action', 'admin_a3_preview_action'])
  })

  await t.test('allows a manager manual quote only after preview and passes normalized stale-write data', async () => {
    const calls = installSupabase({ role: 'manager', onRpc: (name) => {
      if (name === 'admin_a3_preview_action') return manualQuotePreview('US')
      if (name === 'admin_a3_apply_action') return { success: true, quoteId: '55555555-5555-4555-8555-555555555555', deliveryStatus: null, replay: false }
      throw new Error(`Unexpected RPC ${name}`)
    } })
    const res = await invoke(createAdminActionsHandler(), {
      action: 'quote.approve', invitationId, countryCode: 'us', shippingAmount: '21.50',
      expiresAt: quoteExpiresAt, expectedInvitationUpdatedAt: invitationUpdatedAt,
      confirmation: 'CONFIRM', idempotencyKey: 'quote-approve-3',
    })
    assert.equal(res.statusCode, 200)
    const apply = calls.find(({ name }) => name === 'admin_a3_apply_action')
    assert.deepEqual(apply.body.p_request, {
      invitationId, countryCode: 'US', shippingAmount: 21.5, currency: 'EUR',
      expiresAt: quoteExpiresAt, expectedInvitationUpdatedAt: invitationUpdatedAt,
    })
    assert.match(apply.body.p_request_hash, /^[a-f0-9]{64}$/)
  })

  await t.test('requires carrier and tracking for shipped before authentication or RPC work', async () => {
    let fetches = 0
    globalThis.fetch = async () => { fetches += 1; throw new Error('must not fetch') }
    const res = await invoke(createAdminActionsHandler(), {
      action: 'fulfilment.transition', orderId, targetStatus: 'shipped', expectedStatus: 'packed', expectedVersion: 2,
      carrier: 'DHL', trackingNumber: '   ', confirmation: 'CONFIRM', idempotencyKey: 'ship-order-1',
    })
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.error.code, 'invalid_request')
    assert.equal(fetches, 0)
  })

  await t.test('prepares shipping confirmation with stable delivery idempotency and normalized tracking', async () => {
    const delivered = []
    const calls = installSupabase({ role: 'operator', onRpc: (name) => {
      if (name === 'admin_a3_apply_action') return { success: true, entityId: orderId, fulfilmentStatus: 'shipped', fulfilmentVersion: 3, emailAttemptId: attemptId, deliveryStatus: 'pending', replay: false }
      if (name === 'admin_a3_delivery_payload') return { template: 'shipping_confirmation', recipientEmail: 'customer@example.test', firstName: 'Ada', dropTitle: 'Eurofighter Typhoon / A2', carrier: 'DHL', trackingNumber: 'TRACK-123' }
      if (name === 'admin_a3_complete_delivery') return { success: true, entityId: orderId, fulfilmentStatus: 'shipped', fulfilmentVersion: 3, emailAttemptId: attemptId, deliveryStatus: 'suppressed', replay: false }
      throw new Error(`Unexpected RPC ${name}`)
    } })
    const res = await invoke(createAdminActionsHandler({ deliver: async (message) => { delivered.push(message); return { status: 'suppressed', providerId: null } } }), {
      action: 'fulfilment.transition', orderId, targetStatus: 'shipped', expectedStatus: 'packed', expectedVersion: 2,
      carrier: '  DHL  ', trackingNumber: '  TRACK-123  ', confirmation: 'CONFIRM', idempotencyKey: 'ship-order-2',
    })
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.deliveryStatus, 'suppressed')
    assert.equal(delivered[0].idempotencyKey, `poster-valley-operational-${attemptId}`)
    assert.match(delivered[0].text, /Carrier: DHL[\s\S]*Tracking number: TRACK-123/)
    const apply = calls.find(({ name }) => name === 'admin_a3_apply_action')
    assert.deepEqual(apply.body.p_request, { orderId, targetStatus: 'shipped', expectedStatus: 'packed', expectedVersion: 2, carrier: 'DHL', trackingNumber: 'TRACK-123' })
  })

  await t.test('retries a suppressed shipping confirmation without repeating fulfilment', async () => {
    const delivered = []
    const calls = installSupabase({ role: 'operator', onRpc: (name) => {
      if (name === 'admin_a3_preview_action') return { success: true, preview: { orderId, fulfilmentStatus: 'shipped', carrier: 'DHL', trackingNumber: 'TRACK-123', previousDeliveryStatus: 'suppressed', suggestedAction: 'shipping.retry' } }
      if (name === 'admin_a3_apply_action') return { success: true, entityId: orderId, fulfilmentStatus: 'shipped', fulfilmentVersion: 3, emailAttemptId: attemptId, deliveryStatus: 'pending', replay: false }
      if (name === 'admin_a3_delivery_payload') return { template: 'shipping_confirmation', recipientEmail: 'customer@example.test', firstName: 'Ada', dropTitle: 'Eurofighter Typhoon / A2', carrier: 'DHL', trackingNumber: 'TRACK-123' }
      if (name === 'admin_a3_complete_delivery') return { success: true, entityId: orderId, fulfilmentStatus: 'shipped', fulfilmentVersion: 3, emailAttemptId: attemptId, deliveryStatus: 'suppressed', replay: false }
      throw new Error(`Unexpected RPC ${name}`)
    } })
    const preview = await invoke(createAdminActionsHandler(), { action: 'shipping.preview', orderId })
    assert.equal(preview.statusCode, 200)
    const res = await invoke(createAdminActionsHandler({ deliver: async (message) => { delivered.push(message); return { status: 'suppressed', providerId: null } } }), {
      action: 'shipping.retry', orderId, confirmation: 'CONFIRM', idempotencyKey: 'shipping-retry-1',
    })
    assert.equal(res.statusCode, 200)
    assert.equal(delivered.length, 1)
    assert.deepEqual(calls.filter(({ name }) => name === 'admin_a3_apply_action')[0].body.p_request, { orderId })
  })
})
