import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const saved = {
  fetch: globalThis.fetch,
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  confirmation: process.env.ADMIN_CONFIRMATION_SECRET,
}
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
process.env.ADMIN_CONFIRMATION_SECRET = 'confirmation-test-secret-at-least-32-bytes'

const actorId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
const orderId = '11111111-1111-4111-8111-111111111111'
const shippingRequest = {
  orderId,
  targetStatus: 'shipped',
  expectedStatus: 'packed',
  expectedVersion: 2,
  carrier: 'DHL Express (NL)',
  trackingNumber: 'JVGL-123/456',
}
let state

const { createAdminActionsHandler } = await import('../api/admin/actions.js?shipping-confirmation-handler')
const { operationalDeliveryAdapter } = await import('../api/_notifications.js?shipping-confirmation-handler')

function resetState(overrides = {}) {
  state = {
    role: 'manager',
    paymentConfirmed: true,
    fulfilmentStatus: 'packed',
    fulfilmentVersion: 2,
    carrier: null,
    trackingNumber: null,
    shippingEmailStatus: 'not_prepared',
    latestDeliveryStatus: null,
    latestAttemptId: null,
    reconciliationRequired: false,
    stalePending: false,
    attemptCounter: 0,
    replay: new Map(),
    requestHashes: new Map(),
    audit: [],
    entityEvents: [],
    rpcCalls: [],
    ...overrides,
  }
}

function ok(value) {
  return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
}

function databaseError(message) {
  return new Response(JSON.stringify({ message }), { status: 400, headers: { 'content-type': 'application/json' } })
}

function attemptId() {
  state.attemptCounter += 1
  state.latestAttemptId = `44444444-4444-4444-8444-${String(state.attemptCounter).padStart(12, '0')}`
  return state.latestAttemptId
}

function validatePaidAndState(request) {
  if (!state.paymentConfirmed) return 'payment_not_confirmed'
  if (state.fulfilmentStatus !== request.expectedStatus || state.fulfilmentVersion !== request.expectedVersion) return 'stale_transition'
  return null
}

function validStoredShippingDetails() {
  return typeof state.carrier === 'string'
    && state.carrier.length <= 120
    && /^[A-Za-z0-9][A-Za-z0-9 .&()+/_-]*$/.test(state.carrier)
    && typeof state.trackingNumber === 'string'
    && state.trackingNumber.length >= 3
    && state.trackingNumber.length <= 160
    && /^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(state.trackingNumber)
}

function preview(request, action) {
  const invalid = validatePaidAndState(request)
  if (invalid) return databaseError(invalid)
  if (action === 'fulfilment.preview') {
    if (!(state.fulfilmentStatus === 'packed' && request.targetStatus === 'shipped')) return databaseError('invalid_transition')
    return ok({ success: true, preview: {
      orderId,
      currentStatus: state.fulfilmentStatus,
      targetStatus: request.targetStatus,
      fulfilmentVersion: state.fulfilmentVersion,
      dropTitle: 'Eurofighter Typhoon / A2',
      carrier: request.carrier,
      trackingNumber: request.trackingNumber,
    } })
  }
  if (action === 'shipping.reconciliation.preview') {
    if (state.fulfilmentStatus !== 'shipped' || state.latestDeliveryStatus !== 'pending' || !(state.reconciliationRequired || state.stalePending)) return databaseError('invalid_transition')
    return ok({ success: true, preview: {
      orderId,
      fulfilmentStatus: state.fulfilmentStatus,
      fulfilmentVersion: state.fulfilmentVersion,
      dropTitle: 'Eurofighter Typhoon / A2',
      previousDeliveryStatus: state.latestDeliveryStatus,
      reconciliationRequired: true,
      providerOutcome: 'uncertain',
      reconciliationOutcome: request.reconciliationOutcome,
      evidenceNote: request.evidenceNote,
      actionAllowed: true,
      suggestedAction: 'shipping.reconciliation.resolve',
    } })
  }
  if (state.fulfilmentStatus !== 'shipped' || state.latestDeliveryStatus === 'sent') return databaseError('invalid_transition')
  if (state.reconciliationRequired || state.stalePending) {
    return ok({
      success: true,
      deliveryStatus: 'pending',
      reconciliationRequired: true,
      providerOutcome: 'uncertain',
      automaticRetryBlocked: true,
      preview: { orderId, fulfilmentStatus: state.fulfilmentStatus, actionAllowed: false, reconciliationRequired: true },
    })
  }
  if (!validStoredShippingDetails()) return databaseError('invalid_shipping_details')
  return ok({ success: true, preview: {
    orderId,
    fulfilmentStatus: state.fulfilmentStatus,
    carrier: state.carrier,
    trackingNumber: state.trackingNumber,
    previousDeliveryStatus: state.latestDeliveryStatus,
    suggestedAction: 'shipping.retry',
  } })
}

function installSupabase() {
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname
    if (path === '/auth/v1/user') return ok({ id: actorId })
    if (path === '/rest/v1/admin_roles') return ok([{ role: state.role }])
    const name = path.split('/').at(-1)
    const body = JSON.parse(init.body)
    state.rpcCalls.push({ name, body })

    if (name === 'admin_a31_assert_shipping_ready') return ok({ ready: true })
    if (name === 'admin_a32_preview_action') return preview(body.p_request, body.p_action)
    if (name === 'admin_a3_replay_action') {
      const replayKey = `${body.p_action}:${body.p_idempotency_key}`
      const replay = state.replay.get(replayKey)
      if (replay && state.requestHashes.get(replayKey) !== body.p_request_hash) return databaseError('idempotency_conflict')
      return ok(replay ? { found: true, result: replay } : { found: false })
    }
    if (name === 'admin_a32_apply_action') {
      const request = body.p_request
      const invalid = validatePaidAndState(request)
      if (invalid) return databaseError(invalid)
      const replayKey = `${body.p_action}:${body.p_idempotency_key}`
      if (state.replay.has(replayKey)) {
        if (state.requestHashes.get(replayKey) !== body.p_request_hash) return databaseError('idempotency_conflict')
        return ok({ ...state.replay.get(replayKey), replay: true })
      }
      let id
      if (body.p_action === 'fulfilment.transition') {
        if (state.fulfilmentStatus !== 'packed' || request.targetStatus !== 'shipped') return databaseError('invalid_transition')
        state.fulfilmentStatus = 'shipped'
        state.fulfilmentVersion += 1
        state.carrier = request.carrier
        state.trackingNumber = request.trackingNumber
      } else if (body.p_action === 'shipping.retry') {
        if (state.fulfilmentStatus !== 'shipped') return databaseError('invalid_transition')
        if (state.reconciliationRequired || state.stalePending) return databaseError('reconciliation_required')
        if (!validStoredShippingDetails()) return databaseError('invalid_shipping_details')
      } else if (body.p_action === 'shipping.reconciliation.resolve') {
        if (state.fulfilmentStatus !== 'shipped' || state.latestDeliveryStatus !== 'pending' || !(state.reconciliationRequired || state.stalePending)) return databaseError('invalid_transition')
        const accepted = request.reconciliationOutcome === 'provider_acceptance_confirmed'
        state.latestDeliveryStatus = accepted ? 'sent' : 'failed'
        state.shippingEmailStatus = state.latestDeliveryStatus
        state.reconciliationRequired = false
        state.stalePending = false
        const result = {
          success: true,
          entityId: orderId,
          fulfilmentStatus: 'shipped',
          fulfilmentVersion: state.fulfilmentVersion,
          emailAttemptId: state.latestAttemptId,
          deliveryStatus: state.latestDeliveryStatus,
          reconciliationRequired: false,
          reconciliationOutcome: request.reconciliationOutcome,
          providerAcceptanceConfirmed: accepted,
          inboxDeliveryConfirmed: false,
        }
        state.audit.push({ action: `shipping_confirmation.reconciliation.${request.reconciliationOutcome}`, evidence_note: request.evidenceNote, manual_reconciliation: true })
        state.entityEvents.push({ event_type: `shipping_confirmation.reconciliation.${request.reconciliationOutcome}`, evidence_note: request.evidenceNote, manual_reconciliation: true })
        state.replay.set(replayKey, result)
        state.requestHashes.set(replayKey, body.p_request_hash)
        return ok(result)
      } else {
        return databaseError('invalid_transition')
      }
      id = body.p_action === 'shipping.retry' && state.latestDeliveryStatus === 'pending'
        ? state.latestAttemptId
        : attemptId()
      state.shippingEmailStatus = 'pending'
      state.latestDeliveryStatus = 'pending'
      const result = {
        success: true,
        entityId: orderId,
        fulfilmentStatus: 'shipped',
        fulfilmentVersion: state.fulfilmentVersion,
        emailAttemptId: id,
        deliveryStatus: 'pending',
      }
      state.replay.set(replayKey, result)
      state.requestHashes.set(replayKey, body.p_request_hash)
      return ok(result)
    }
    if (name === 'admin_a32_claim_delivery') {
      if (state.reconciliationRequired || state.stalePending) {
        state.reconciliationRequired = true
        state.stalePending = false
        return ok({ claimed: false, deliveryStatus: 'pending', reconciliationRequired: true })
      }
      return ok({ claimed: true })
    }
    if (name === 'admin_a32_delivery_payload') return ok({
      template: 'shipping_confirmation',
      recipientEmail: 'ada@example.test',
      firstName: 'Ada',
      dropTitle: 'Eurofighter Typhoon / A2',
      carrier: state.carrier,
      trackingNumber: state.trackingNumber,
    })
    if (name === 'admin_a32_complete_delivery') {
      if (body.p_delivery_status === 'pending') {
        state.reconciliationRequired = true
        const replayKey = `${body.p_action}:${body.p_idempotency_key}`
        const result = {
          ...state.replay.get(replayKey),
          deliveryStatus: 'pending',
          reconciliationRequired: true,
          providerOutcome: 'uncertain',
          automaticRetryBlocked: true,
        }
        state.replay.set(replayKey, result)
        return ok(result)
      }
      state.shippingEmailStatus = body.p_delivery_status
      state.latestDeliveryStatus = body.p_delivery_status
      const result = {
        success: true,
        entityId: orderId,
        fulfilmentStatus: 'shipped',
        fulfilmentVersion: state.fulfilmentVersion,
        emailAttemptId: body.p_attempt_id,
        deliveryStatus: body.p_delivery_status,
      }
      state.replay.set(`${body.p_action}:${body.p_idempotency_key}`, result)
      return ok(result)
    }
    throw new Error(`Unexpected RPC ${name}`)
  }
}

function response() {
  return {
    statusCode: 0,
    body: null,
    status(code) { this.statusCode = code; return this },
    setHeader() { return this },
    end(value) { this.body = JSON.parse(value) },
  }
}

async function invoke(handler, body) {
  const res = response()
  await handler({ method: 'POST', body, headers: { authorization: 'Bearer valid-manager-session' } }, res)
  return res
}

async function reviewShipment(handler) {
  return invoke(handler, { action: 'fulfilment.preview', ...shippingRequest })
}

async function confirmShipment(handler, proof, key = 'shipping-transition-1') {
  return invoke(handler, {
    action: 'fulfilment.transition',
    ...shippingRequest,
    confirmationProof: proof,
    idempotencyKey: key,
  })
}

async function reviewRetry(handler) {
  return invoke(handler, {
    action: 'shipping.preview',
    orderId,
    expectedStatus: state.fulfilmentStatus,
    expectedVersion: state.fulfilmentVersion,
  })
}

async function confirmRetry(handler, proof, key = 'shipping-retry-1') {
  return invoke(handler, {
    action: 'shipping.retry',
    orderId,
    expectedStatus: state.fulfilmentStatus,
    expectedVersion: state.fulfilmentVersion,
    confirmationProof: proof,
    idempotencyKey: key,
  })
}

async function reviewReconciliation(handler, reconciliationOutcome = 'provider_acceptance_confirmed', evidenceNote = 'Verified in the provider dashboard by timestamp.') {
  return invoke(handler, {
    action: 'shipping.reconciliation.preview',
    orderId,
    expectedStatus: state.fulfilmentStatus,
    expectedVersion: state.fulfilmentVersion,
    reconciliationOutcome,
    evidenceNote,
  })
}

async function confirmReconciliation(handler, proof, reconciliationOutcome = 'provider_acceptance_confirmed', evidenceNote = 'Verified in the provider dashboard by timestamp.', key = 'shipping-reconciliation-1') {
  return invoke(handler, {
    action: 'shipping.reconciliation.resolve',
    orderId,
    expectedStatus: state.fulfilmentStatus,
    expectedVersion: state.fulfilmentVersion,
    reconciliationOutcome,
    evidenceNote,
    confirmationProof: proof,
    idempotencyKey: key,
  })
}

before(() => {
  resetState()
  installSupabase()
})

after(() => {
  globalThis.fetch = saved.fetch
  for (const [name, value] of [
    ['SUPABASE_URL', saved.url],
    ['SUPABASE_SERVICE_ROLE_KEY', saved.key],
    ['ADMIN_CONFIRMATION_SECRET', saved.confirmation],
  ]) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

test('unpaid order is rejected before a shipped mutation', async () => {
  resetState({ paymentConfirmed: false })
  const result = await reviewShipment(createAdminActionsHandler())
  assert.equal(result.statusCode, 409)
  assert.equal(result.body.error.code, 'payment_not_confirmed')
  assert.equal(state.fulfilmentStatus, 'packed')
})

test('wrong fulfilment status is rejected before shipping', async () => {
  resetState({ fulfilmentStatus: 'ready_to_pack', fulfilmentVersion: 2 })
  const result = await invoke(createAdminActionsHandler(), {
    action: 'fulfilment.preview',
    ...shippingRequest,
    expectedStatus: 'ready_to_pack',
  })
  assert.equal(result.statusCode, 409)
  assert.equal(result.body.error.code, 'invalid_transition')
})

test('stale fulfilment version is rejected before shipping', async () => {
  resetState({ fulfilmentVersion: 3 })
  const result = await reviewShipment(createAdminActionsHandler())
  assert.equal(result.statusCode, 409)
  assert.equal(result.body.error.code, 'stale_transition')
})

test('missing or unsafe carrier and tracking values are rejected before RPC', async () => {
  for (const details of [
    { carrier: '', trackingNumber: 'JVGL-123' },
    { carrier: 'DHL\nInjected', trackingNumber: 'JVGL-123' },
    { carrier: 'DHL', trackingNumber: 'https://tracking.example.test/123' },
    { carrier: 'DHL', trackingNumber: 'X' },
  ]) {
    resetState()
    const result = await invoke(createAdminActionsHandler(), {
      action: 'fulfilment.preview',
      ...shippingRequest,
      ...details,
    })
    assert.equal(result.statusCode, 400)
    assert.equal(state.rpcCalls.length, 0)
  }
})

test('operator cannot preview or confirm the manager-only shipped transition', async () => {
  resetState({ role: 'operator' })
  const result = await reviewShipment(createAdminActionsHandler())
  assert.equal(result.statusCode, 403)
  assert.equal(result.body.error.code, 'insufficient_role')
  assert.equal(state.rpcCalls.length, 0)
})

test('successful shipped transition is finalized once and safely replayed', async () => {
  resetState()
  let deliveries = 0
  const handler = createAdminActionsHandler({ deliver: async () => {
    deliveries += 1
    return { status: 'sent', providerId: 'resend_shipping_success_1' }
  } })
  const reviewed = await reviewShipment(handler)
  const first = await confirmShipment(handler, reviewed.body.confirmation.proof)
  const replayed = await confirmShipment(handler, reviewed.body.confirmation.proof)
  assert.equal(first.statusCode, 200)
  assert.equal(first.body.deliveryStatus, 'sent')
  assert.equal(replayed.body.replay, true)
  assert.equal(deliveries, 1)
  assert.equal(state.fulfilmentStatus, 'shipped')
  assert.equal(state.fulfilmentVersion, 3)
  assert.equal(state.carrier, shippingRequest.carrier)
  assert.equal(state.trackingNumber, shippingRequest.trackingNumber)
  assert.equal(state.shippingEmailStatus, 'sent')
})

test('non-Production shipping email is suppressed without provider delivery', async () => {
  resetState()
  let providerCalls = 0
  const deliver = operationalDeliveryAdapter({
    env: { VERCEL_ENV: 'preview', POSTER_VALLEY_ENV: 'staging', NODE_ENV: 'production' },
    fetchImpl: async () => { providerCalls += 1; throw new Error('must not be called') },
  })
  const handler = createAdminActionsHandler({ deliver })
  const reviewed = await reviewShipment(handler)
  const result = await confirmShipment(handler, reviewed.body.confirmation.proof)
  assert.equal(result.body.deliveryStatus, 'suppressed')
  assert.equal(providerCalls, 0)
  assert.equal(state.fulfilmentStatus, 'shipped')
  assert.equal(state.shippingEmailStatus, 'suppressed')
})

test('provider failure preserves shipped and retry sends once without repeating fulfilment', async () => {
  resetState()
  const failedHandler = createAdminActionsHandler({ deliver: async () => ({ status: 'failed', providerId: null }) })
  const reviewed = await reviewShipment(failedHandler)
  const failed = await confirmShipment(failedHandler, reviewed.body.confirmation.proof)
  assert.equal(failed.body.deliveryStatus, 'failed')
  assert.equal(state.fulfilmentStatus, 'shipped')
  assert.equal(state.fulfilmentVersion, 3)
  assert.equal(state.shippingEmailStatus, 'failed')

  let retryDeliveries = 0
  const retryHandler = createAdminActionsHandler({ deliver: async () => {
    retryDeliveries += 1
    return { status: 'sent', providerId: 'resend_shipping_retry_1' }
  } })
  const retryPreview = await reviewRetry(retryHandler)
  const retried = await confirmRetry(retryHandler, retryPreview.body.confirmation.proof)
  const replayedRetry = await confirmRetry(retryHandler, retryPreview.body.confirmation.proof)
  assert.equal(retried.body.deliveryStatus, 'sent')
  assert.equal(replayedRetry.body.replay, true)
  assert.equal(retryDeliveries, 1)
  assert.equal(state.fulfilmentStatus, 'shipped')
  assert.equal(state.fulfilmentVersion, 3)
  assert.equal(state.shippingEmailStatus, 'sent')
  assert.equal(state.attemptCounter, 2)
})

test('stale pending returns a distinct 202 reconciliation response and blocks normal retry', async () => {
  resetState({
    fulfilmentStatus: 'shipped',
    fulfilmentVersion: 3,
    carrier: 'DHL Express (NL)',
    trackingNumber: 'JVGL-123/456',
    shippingEmailStatus: 'pending',
    latestDeliveryStatus: 'pending',
    latestAttemptId: '44444444-4444-4444-8444-000000000001',
    attemptCounter: 1,
    stalePending: true,
  })
  const handler = createAdminActionsHandler({ deliver: async () => { throw new Error('must not dispatch') } })
  const result = await reviewRetry(handler)
  assert.equal(result.statusCode, 202)
  assert.equal(result.body.deliveryStatus, 'pending')
  assert.equal(result.body.reconciliationRequired, true)
  assert.equal(result.body.providerOutcome, 'uncertain')
  assert.equal(result.body.automaticRetryBlocked, true)
  assert.equal('replay' in result.body, false)
  assert.equal(state.rpcCalls.some((call) => call.name === 'admin_a32_apply_action'), false)
})

test('ambiguous provider acceptance is persisted as pending reconciliation without automatic retry', async () => {
  resetState()
  let deliveries = 0
  const handler = createAdminActionsHandler({ deliver: async () => {
    deliveries += 1
    return { status: 'pending', providerId: null, reconciliationRequired: true }
  } })
  const reviewed = await reviewShipment(handler)
  const result = await confirmShipment(handler, reviewed.body.confirmation.proof)
  assert.equal(result.statusCode, 202)
  assert.equal(result.body.deliveryStatus, 'pending')
  assert.equal(result.body.reconciliationRequired, true)
  assert.equal(state.reconciliationRequired, true)
  assert.equal(deliveries, 1)

  const repeated = await confirmShipment(handler, reviewed.body.confirmation.proof)
  assert.equal(repeated.statusCode, 202)
  assert.equal(repeated.body.reconciliationRequired, true)
  assert.equal(deliveries, 1)
})

test('shipping reconciliation is manager-only and never dispatches email', async () => {
  resetState({
    role: 'operator',
    fulfilmentStatus: 'shipped',
    fulfilmentVersion: 3,
    carrier: 'DHL',
    trackingNumber: 'TRACK-123',
    shippingEmailStatus: 'pending',
    latestDeliveryStatus: 'pending',
    latestAttemptId: '44444444-4444-4444-8444-000000000001',
    reconciliationRequired: true,
  })
  const result = await reviewReconciliation(createAdminActionsHandler())
  assert.equal(result.statusCode, 403)
  assert.equal(result.body.error.code, 'insufficient_role')
  assert.equal(state.rpcCalls.length, 0)
})

test('confirmed provider acceptance closes only the existing attempt and safely replays', async () => {
  resetState({
    fulfilmentStatus: 'shipped',
    fulfilmentVersion: 3,
    carrier: 'DHL',
    trackingNumber: 'TRACK-123',
    shippingEmailStatus: 'pending',
    latestDeliveryStatus: 'pending',
    latestAttemptId: '44444444-4444-4444-8444-000000000001',
    attemptCounter: 1,
    reconciliationRequired: true,
  })
  let deliveries = 0
  const handler = createAdminActionsHandler({ deliver: async () => { deliveries += 1; return { status: 'sent', providerId: 'must_not_send' } } })
  const reviewed = await reviewReconciliation(handler)
  const first = await confirmReconciliation(handler, reviewed.body.confirmation.proof)
  const replayed = await confirmReconciliation(handler, reviewed.body.confirmation.proof)
  assert.equal(first.statusCode, 200)
  assert.equal(first.body.deliveryStatus, 'sent')
  assert.equal(first.body.reconciliationOutcome, 'provider_acceptance_confirmed')
  assert.equal(first.body.providerAcceptanceConfirmed, true)
  assert.equal(first.body.inboxDeliveryConfirmed, false)
  assert.equal(replayed.body.replay, true)
  assert.equal(deliveries, 0)
  assert.equal(state.attemptCounter, 1)
  assert.equal(state.fulfilmentVersion, 3)
  assert.equal(state.shippingEmailStatus, 'sent')
  assert.deepEqual(state.audit[0], {
    action: 'shipping_confirmation.reconciliation.provider_acceptance_confirmed',
    evidence_note: 'Verified in the provider dashboard by timestamp.',
    manual_reconciliation: true,
  })
})

test('confirmed provider non-acceptance closes the old attempt and permits a new-key retry', async () => {
  resetState({
    fulfilmentStatus: 'shipped',
    fulfilmentVersion: 3,
    carrier: 'DHL',
    trackingNumber: 'TRACK-123',
    shippingEmailStatus: 'pending',
    latestDeliveryStatus: 'pending',
    latestAttemptId: '44444444-4444-4444-8444-000000000001',
    attemptCounter: 1,
    reconciliationRequired: true,
  })
  let deliveries = 0
  const handler = createAdminActionsHandler({ deliver: async () => {
    deliveries += 1
    return { status: 'sent', providerId: 'resend_after_reconciliation_1' }
  } })
  const note = 'Provider dashboard confirms that no request was accepted.'
  const reviewed = await reviewReconciliation(handler, 'provider_non_acceptance_confirmed', note)
  const reconciled = await confirmReconciliation(handler, reviewed.body.confirmation.proof, 'provider_non_acceptance_confirmed', note)
  assert.equal(reconciled.body.deliveryStatus, 'failed')
  assert.equal(reconciled.body.reconciliationOutcome, 'provider_non_acceptance_confirmed')
  assert.equal(deliveries, 0)
  assert.equal(state.attemptCounter, 1)
  assert.equal(state.fulfilmentVersion, 3)

  const retryPreview = await reviewRetry(handler)
  const retried = await confirmRetry(handler, retryPreview.body.confirmation.proof, 'shipping-retry-after-reconciliation')
  assert.equal(retried.body.deliveryStatus, 'sent')
  assert.equal(deliveries, 1)
  assert.equal(state.attemptCounter, 2)
  assert.equal(state.fulfilmentVersion, 3)
})

test('same reconciliation key conflicts when the confirmed outcome changes', async () => {
  resetState({
    fulfilmentStatus: 'shipped',
    fulfilmentVersion: 3,
    carrier: 'DHL',
    trackingNumber: 'TRACK-123',
    shippingEmailStatus: 'pending',
    latestDeliveryStatus: 'pending',
    latestAttemptId: '44444444-4444-4444-8444-000000000001',
    attemptCounter: 1,
    reconciliationRequired: true,
  })
  const handler = createAdminActionsHandler()
  const accepted = await reviewReconciliation(handler)
  const first = await confirmReconciliation(handler, accepted.body.confirmation.proof)
  assert.equal(first.statusCode, 200)

  state.latestDeliveryStatus = 'pending'
  state.shippingEmailStatus = 'pending'
  state.reconciliationRequired = true
  const note = 'Provider dashboard confirms that no request was accepted.'
  const rejected = await reviewReconciliation(handler, 'provider_non_acceptance_confirmed', note)
  const conflict = await confirmReconciliation(handler, rejected.body.confirmation.proof, 'provider_non_acceptance_confirmed', note)
  assert.equal(conflict.statusCode, 409)
  assert.equal(conflict.body.error.code, 'idempotency_conflict')
})

test('legacy carrier and tracking values are rejected before a retry dispatch', async () => {
  for (const invalid of [
    { carrier: 'DHL\nInjected', trackingNumber: 'TRACK-123' },
    { carrier: 'DHL', trackingNumber: 'TRACK|123' },
    { carrier: `DHL${String.fromCharCode(1)}`, trackingNumber: 'TRACK-123' },
  ]) {
    resetState({
      fulfilmentStatus: 'shipped',
      fulfilmentVersion: 3,
      shippingEmailStatus: 'failed',
      latestDeliveryStatus: 'failed',
      ...invalid,
    })
    let deliveries = 0
    const handler = createAdminActionsHandler({ deliver: async () => { deliveries += 1; return { status: 'sent', providerId: 'must_not_send' } } })
    const result = await reviewRetry(handler)
    assert.equal(result.statusCode, 409)
    assert.equal(result.body.error.code, 'invalid_shipping_details')
    assert.equal(deliveries, 0)
    assert.equal(state.latestDeliveryStatus, 'failed')
  }
})
