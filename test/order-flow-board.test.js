import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const temp = await mkdtemp(join(tmpdir(), 'poster-valley-order-flow-'))
const contractsSource = await readFile('src/admin/contracts.ts', 'utf8')
const contractsOutput = ts.transpileModule(contractsSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
await writeFile(join(temp, 'contracts.mjs'), contractsOutput)
const flowSource = await readFile('src/admin/orderFlow.ts', 'utf8')
const flowOutput = ts.transpileModule(flowSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText.replaceAll("'./contracts'", "'./contracts.mjs'")
await writeFile(join(temp, 'orderFlow.mjs'), flowOutput)
const flow = await import(`file://${join(temp, 'orderFlow.mjs')}`)

const card = (stage, extra = {}) => ({
  source_id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', source_type: 'drop', stage,
  board_version: 0, created_at: '2026-08-02T10:00:00Z', production_threshold: 5,
  qualified_units: 3, units_needed: 2, threshold_reached: false,
  invitation_delivery_status: null, invitation_status: null, invitation_expires_at: null,
  payment_status: null, fulfilment_status: null, delivery_confirmed_at: null,
  tracking_number: null, ...extra,
})

test('board exposes five active one-way phases and no Ready to invite phase', () => {
  assert.deepEqual(Object.keys(flow.orderFlowStageMeta), ['new', 'interest', 'awaiting_payment', 'paid_to_ship', 'shipped'])
  assert.equal(Object.hasOwn(flow.orderFlowStageMeta, 'ready_to_invite'), false)
})

test('Interest always exposes Send invite while closing still requires delivery confirmation', () => {
  assert.equal(flow.primaryAction(card('new')), 'Process')
  assert.equal(flow.primaryAction(card('interest')), 'Send invite')
  assert.equal(flow.primaryAction(card('interest', { production_threshold: null })), 'Send invite')
  assert.equal(flow.primaryAction(card('interest', { threshold_reached: true })), 'Send invite')
  assert.equal(flow.primaryAction(card('ready_to_invite')), 'Send invite')
  assert.equal(flow.primaryAction(card('paid_to_ship')), 'Ship')
  assert.equal(flow.primaryAction(card('shipped')), null)
  assert.equal(flow.primaryAction(card('shipped', { delivery_confirmed_at: '2026-08-02T12:00:00Z' })), 'Close')
})

test('Process and invitation payloads contain no client-selected destination or threshold override', () => {
  assert.deepEqual(flow.previewPayloadForCard(card('new'), 'Process'), {
    action: 'board.process.preview', sourceType: 'drop', sourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', expectedVersion: 0,
  })
  assert.deepEqual(flow.previewPayloadForCard(card('interest'), 'Send invite'), {
    action: 'invitation.preview', reservationId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  })
})

test('threshold copy uses the stored per-drop progress and handles missing configuration', () => {
  assert.equal(flow.thresholdStatusLine(card('interest')), '3 / 5 interested · 2 more needed')
  assert.equal(flow.thresholdStatusLine(card('interest', { qualified_units: 5, units_needed: 0, threshold_reached: true })), '5 / 5 interested · Threshold reached')
  assert.equal(flow.thresholdStatusLine(card('interest', { production_threshold: null, units_needed: null })), 'Threshold not configured')
  assert.equal(flow.thresholdStatusLine(card('awaiting_payment')), null)
})

test('failed invitation remains retryable in Interest and successful invitation moves one card', () => {
  const failed = card('interest', { source_id: 'failed', invitation_delivery_status: 'failed', needs_attention: true })
  const sent = card('awaiting_payment', { source_id: 'sent', invitation_status: 'sent', invitation_delivery_status: 'sent' })
  const untouched = card('interest', { source_id: 'untouched' })
  assert.match(flow.cardStatusLine(failed), /failed · retry safely/i)
  const grouped = flow.cardsByStage([failed, sent, untouched])
  assert.deepEqual(grouped.awaiting_payment.map((item) => item.source_id), ['sent'])
  assert.deepEqual(grouped.interest.map((item) => item.source_id), ['failed', 'untouched'])
})

test('legacy Ready to invite responses are safely folded into Interest during database-first rollout', () => {
  const grouped = flow.cardsByStage([card('ready_to_invite', { source_id: 'legacy' })])
  assert.deepEqual(grouped.interest.map((item) => item.source_id), ['legacy'])
})

test('payment exceptions remain visible as attention copy', () => {
  assert.match(flow.cardStatusLine(card('awaiting_payment', { payment_status: 'failed' })), /needs attention/i)
})
