import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { operationalDeliveryAdapter, operationalEmailConfiguration } from '../api/_notifications.js'
import { actionRequestHash, buildOperationalMessage, issueConfirmationProof, previewFingerprint, verifyConfirmationProof } from '../api/admin/_actions.js'

const complete = { VERCEL_ENV: 'production', POSTER_VALLEY_ENV: 'production', NODE_ENV: 'production', OPERATIONAL_EMAIL_DELIVERY_ENABLED: 'true', RESEND_API_KEY: 're_test', OPERATIONAL_EMAIL_FROM: 'Poster Valley <studio@mail.postervalley.nl>', OPERATIONAL_EMAIL_REPLY_TO: 'studio@postervalley.nl', SITE_URL: 'https://www.postervalley.nl', ADMIN_INVITATION_TOKEN_SECRET: 'token-secret', ADMIN_CONFIRMATION_SECRET: 'confirmation-secret' }

test('real delivery is possible only in explicitly enabled, completely configured Production', () => {
  assert.equal(operationalEmailConfiguration(complete).mode, 'live')
  for (const env of [
    { ...complete, VERCEL_ENV: 'preview' }, { ...complete, POSTER_VALLEY_ENV: 'staging' },
    { ...complete, NODE_ENV: 'test' }, { ...complete, OPERATIONAL_EMAIL_DELIVERY_ENABLED: 'false' },
  ]) assert.equal(operationalEmailConfiguration(env).mode, 'suppressed')
  const missing = operationalEmailConfiguration({ ...complete, RESEND_API_KEY: '' })
  assert.equal(missing.mode, 'unavailable')
  assert.deepEqual(missing.missing, ['RESEND_API_KEY'])
})

test('Resend adapter forwards durable idempotency and stores only a bounded provider id', async () => {
  let request
  const deliver = operationalDeliveryAdapter({ env: complete, fetchImpl: async (_url, init) => { request = init; return new Response(JSON.stringify({ id: 'resend_message_123' }), { status: 200 }) } })
  const result = await deliver({ template: 'order_invitation', idempotencyKey: 'poster-valley-operational-attempt', to: 'ada@example.test', subject: 'Invitation', html: '<p>Hello</p>', text: 'Hello' })
  assert.deepEqual(result, { status: 'sent', providerId: 'resend_message_123' })
  assert.equal(request.headers['Idempotency-Key'], 'poster-valley-operational-attempt')
  assert.equal(JSON.parse(request.body).from, complete.OPERATIONAL_EMAIL_FROM)
  assert.equal(JSON.parse(request.body).reply_to, complete.OPERATIONAL_EMAIL_REPLY_TO)
})

test('shipping confirmation uses the same Production gate and escapes customer-visible fields', async () => {
  let request
  const deliver = operationalDeliveryAdapter({ env: complete, fetchImpl: async (_url, init) => {
    request = init
    return new Response(JSON.stringify({ id: 'resend_shipping_123' }), { status: 200 })
  } })
  const message = buildOperationalMessage({
    template: 'shipping_confirmation',
    recipientEmail: 'ada@example.test',
    firstName: 'Ada <script>',
    dropTitle: 'Eurofighter & Typhoon',
    carrier: 'DHL Express (NL)',
    trackingNumber: 'JVGL-123/456',
  })
  const result = await deliver({ ...message, idempotencyKey: 'poster-valley-operational-shipping-attempt' })
  assert.deepEqual(result, { status: 'sent', providerId: 'resend_shipping_123' })
  const body = JSON.parse(request.body)
  assert.equal(body.to[0], 'ada@example.test')
  assert.match(body.html, /Ada &lt;script&gt;/)
  assert.match(body.html, /Eurofighter &amp; Typhoon/)
  assert.doesNotMatch(body.html, /<script>/)
  assert.match(body.text, /Tracking number: JVGL-123\/456/)
})

test('definitive failures fail and ambiguous timeout/concurrent responses remain pending', async () => {
  const serverFailure = operationalDeliveryAdapter({ env: complete, fetchImpl: async () => new Response('{}', { status: 422 }) })
  const concurrent = operationalDeliveryAdapter({ env: complete, fetchImpl: async () => new Response('{}', { status: 409 }) })
  const timeout = operationalDeliveryAdapter({ env: complete, fetchImpl: async () => { throw new Error('network timeout containing no customer data') } })
  const injectedTimeout = operationalDeliveryAdapter({ send: async () => { throw new Error('injected timeout containing no customer data') } })
  assert.equal((await serverFailure({ template: 'order_invitation' })).status, 'failed')
  assert.deepEqual(await concurrent({ template: 'order_invitation' }), { status: 'pending', providerId: null, reconciliationRequired: true })
  assert.deepEqual(await timeout({ template: 'order_invitation' }), { status: 'pending', providerId: null, reconciliationRequired: true })
  assert.deepEqual(await injectedTimeout({ template: 'shipping_confirmation' }), { status: 'pending', providerId: null, reconciliationRequired: true })
})

test('successful provider responses without a verifiable id remain pending for reconciliation', async () => {
  for (const response of [
    new Response('{}', { status: 200 }),
    new Response(JSON.stringify({ id: 'contains spaces' }), { status: 202 }),
    new Response(null, { status: 204 }),
  ]) {
    const deliver = operationalDeliveryAdapter({ env: complete, fetchImpl: async () => response })
    assert.deepEqual(await deliver({ template: 'shipping_confirmation' }), {
      status: 'pending',
      providerId: null,
      reconciliationRequired: true,
    })
  }

  const accepted = operationalDeliveryAdapter({
    env: complete,
    fetchImpl: async () => new Response(JSON.stringify({ id: 'resend_shipping_verified_1' }), { status: 202 }),
  })
  assert.deepEqual(await accepted({ template: 'shipping_confirmation' }), {
    status: 'sent',
    providerId: 'resend_shipping_verified_1',
  })
})

test('confirmation proof is actor/action/payload/state bound and expires', () => {
  const saved = process.env.ADMIN_CONFIRMATION_SECRET
  process.env.ADMIN_CONFIRMATION_SECRET = 'confirmation-proof-test-secret-at-least-32-bytes'
  try {
    const actorUserId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'; const action = 'invitation.send'
    const requestHash = actionRequestHash(action, { reservationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
    const previewHash = previewFingerprint({ invitationStatus: 'draft' })
    const issued = issueConfirmationProof({ actorUserId, action, requestHash, previewHash, now: 1000 })
    assert.equal(verifyConfirmationProof(issued.proof, { actorUserId, action, requestHash, now: 2000 }).previewHash, previewHash)
    assert.throws(() => verifyConfirmationProof(issued.proof, { actorUserId, action: 'invitation.resend', requestHash, now: 2000 }), /does not match/i)
    assert.throws(() => verifyConfirmationProof(issued.proof, { actorUserId, action, requestHash, now: 700000 }), /expired/i)
  } finally {
    if (saved === undefined) delete process.env.ADMIN_CONFIRMATION_SECRET
    else process.env.ADMIN_CONFIRMATION_SECRET = saved
  }
})

test('A3.2 SQL keeps confirmation, manager authorization, token grace, and RPC privileges server-side', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20260721151023_admin_invitation_delivery_confirmation.sql', import.meta.url), 'utf8')
  assert.match(sql, /security definer set search_path = public, pg_temp/gi)
  assert.match(sql, /role='manager'|role = 'manager'/)
  assert.match(sql, /p_confirmation_hash is distinct from p_request_hash/)
  assert.match(sql, /ambiguous_invitations/)
  assert.match(sql, /recipient_mismatch/)
  assert.match(sql, /previous_token_hash/)
  assert.match(sql, /interval '23 hours'/)
  for (const name of ['admin_a32_preview_action', 'admin_a32_apply_action', 'admin_a32_change_origin', 'admin_a32_claim_delivery', 'admin_a32_delivery_payload', 'admin_a32_complete_delivery']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public, anon, authenticated`))
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`))
  }
  assert.doesNotMatch(sql, /grant execute[^;]+to (?:anon|authenticated)/i)
})

test('Admin UI has action-specific button confirmation and no typed literal contract', async () => {
  const [ui, actions] = await Promise.all([readFile(new URL('../src/admin/AdminApp.tsx', import.meta.url), 'utf8'), readFile(new URL('../src/admin/actions.ts', import.meta.url), 'utf8')])
  assert.doesNotMatch(ui, /Type CONFIRM|browser\.confirm|window\.confirm/)
  for (const label of ['Send invitation', 'Retry invitation email', 'Resend invitation', 'Approve quote', 'Mark as shipped', 'Change classification']) assert.match(actions, new RegExp(label))
  assert.match(ui, /cancel\.current\?\.focus\(\)/)
  assert.match(ui, /stopImmediatePropagation/)
  assert.match(ui, /submitting\.current/)
  assert.match(ui, /aria-busy/)
  assert.match(ui, /role="status" aria-live="polite"/)
  assert.match(ui, /requestAnimationFrame\(\(\) => initiatingButton\.current\?\.focus\(\)\)/)
})
