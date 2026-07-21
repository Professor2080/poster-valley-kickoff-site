import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const temp = await mkdtemp(join(tmpdir(), 'poster-valley-admin-actions-'))
const source = await readFile('src/admin/actions.ts', 'utf8')
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
const modulePath = join(temp, 'actions.mjs')
await writeFile(modulePath, output)
const actions = await import(`file://${modulePath}`)

const id = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'

test('contextual actions respect record lifecycle and manager-only quote controls', () => {
  assert.deepEqual(actions.contextualActions('reservations', { id, reservation_status: 'cancelled' }, 'manager').map((action) => action.mutationAction), ['origin.change'])
  assert.equal(actions.contextualActions('reservations', { id, reservation_status: 'new' }, 'operator')[0].previewAction, 'invitation.preview')
  assert.equal(actions.contextualActions('reservations', { id, reservation_status: 'new' }, 'manager').at(-1).mutationAction, 'origin.change')

  const invitation = { id, interest_request_id: id, status: 'sent', updated_at: '2026-07-20T12:00:00Z' }
  const operatorActions = actions.contextualActions('invitations', invitation, 'operator')
  assert.deepEqual(operatorActions.map((action) => action.mutationAction), ['invitation.resend'])
  const managerActions = actions.contextualActions('invitations', invitation, 'manager')
  assert.deepEqual(managerActions.map((action) => action.mutationAction), ['invitation.resend', 'quote.approve'])
  assert.equal(actions.contextualActions('orders', { id, status: 'paid', fulfilment_status: 'shipped', shipping_email_status: 'failed' }, 'operator')[0].mutationAction, 'shipping.retry')
  assert.deepEqual(actions.contextualActions('orders', { id, status: 'paid', fulfilment_status: 'shipped', shipping_email_status: 'sent' }, 'operator'), [])
  assert.deepEqual(actions.contextualActions('invitations', { ...invitation, expires_at: '2000-01-01T00:00:00Z' }, 'manager').map((action) => action.mutationAction), ['invitation.resend'])

  assert.deepEqual(actions.contextualActions('orders', { id, status: 'payment_open', fulfilment_status: 'unfulfilled' }, 'manager'), [])
  assert.equal(actions.contextualActions('orders', { id, status: 'paid', fulfilment_status: 'packed' }, 'operator')[0].targetStatus, 'shipped')
})

test('contextual history is narrow and entity-scoped', () => {
  const invitation = actions.historyDefinitions('invitations', { id })
  assert.deepEqual(invitation.map((definition) => definition.resource), ['orders', 'quotes', 'email_events', 'audit', 'events'])
  assert.deepEqual(invitation.find((definition) => definition.resource === 'email_events').filters, { entity_type: 'order_invitation', entity_id: id })
  const order = actions.historyDefinitions('orders', { id })
  assert.deepEqual(order.find((definition) => definition.resource === 'payments').filters, { order_id: id })
})

test('one confirmed action attempt keeps a stable idempotency key for transport retries', () => {
  let keyCalls = 0
  const attempt = actions.createActionAttempt('fulfilment.transition', { orderId: id, expectedVersion: 2 }, { targetStatus: 'packed' }, () => { keyCalls++; return 'stable-retry-key' })
  assert.equal(attempt.idempotencyKey, 'stable-retry-key')
  assert.equal(attempt.idempotencyKey, 'stable-retry-key')
  assert.equal(keyCalls, 1)
  assert.equal(actions.actionInputsDisabled('failure', attempt), true, 'a failed transport retry must keep visible payload inputs locked')
  assert.equal(actions.actionInputsDisabled('idle', attempt), true, 'editing an existing confirmed attempt is never allowed')
  assert.equal(actions.actionInputsDisabled('idle', null), false)
})

test('action feedback distinguishes truthful delivery outcomes and actionable errors', () => {
  assert.match(actions.actionResultMessage({ success: true, deliveryStatus: 'suppressed' }), /safely suppressed/)
  assert.match(actions.actionResultMessage({ success: true, deliveryStatus: 'failed' }), /delivery failed/i)
  assert.match(actions.actionResultMessage({ success: true, deliveryStatus: 'sent' }), /provider confirmed/)
  assert.match(actions.actionResultMessage({ success: true, deliveryStatus: 'pending' }), /already in progress/i)
  assert.equal(actions.completionPhase({ success: true, deliveryStatus: 'pending' }), 'conflict')
  assert.equal(actions.completionPhase({ success: true, deliveryStatus: 'failed' }), 'failure')
  assert.equal(actions.completionPhase({ success: true, deliveryStatus: 'suppressed' }), 'success')
  assert.equal(actions.completionPhase({ success: true, deliveryStatus: 'sent' }), 'success')
  assert.equal(actions.classifyActionError({ status: 403, code: 'insufficient_role' }), 'forbidden')
  assert.equal(actions.classifyActionError({ status: 409, code: 'stale_transition' }), 'conflict')
  assert.equal(actions.classifyActionError({ status: 503, code: 'admin_unavailable' }), 'failure')
})

test('Admin UI uses contextual preview-confirm controls and accessible outcome focus', async () => {
  const app = await readFile('src/admin/AdminApp.tsx', 'utf8')
  assert.doesNotMatch(app, /Reservation UUID|invitation\.prepare/)
  assert.match(app, /action\.previewAction/)
  assert.match(app, /Type CONFIRM/)
  assert.match(app, /confirmationInput\.current\?\.focus\(\)/)
  assert.match(app, /outcome\.current\?\.focus\(\)/)
  assert.match(app, /View<span className="sr-only">[\s\S]*record[\s\S]*details<\/span>/)
})
