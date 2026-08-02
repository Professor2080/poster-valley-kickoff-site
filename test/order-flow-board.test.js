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
  board_version: 0, created_at: '2026-08-02T10:00:00Z', production_threshold: null,
  invitation_delivery_status: null, invitation_status: null, invitation_expires_at: null,
  payment_status: null, fulfilment_status: null, delivery_confirmed_at: null,
  tracking_number: null, ...extra,
})

test('board exposes the six fixed one-way phases', () => {
  assert.deepEqual(Object.keys(flow.orderFlowStageMeta), ['new', 'interest', 'ready_to_invite', 'awaiting_payment', 'paid_to_ship', 'shipped'])
})

test('primary actions are explicit and closing requires delivery confirmation', () => {
  assert.equal(flow.primaryAction(card('new')), 'Process')
  assert.equal(flow.primaryAction(card('interest')), null)
  assert.equal(flow.primaryAction(card('ready_to_invite')), 'Send')
  assert.equal(flow.primaryAction(card('paid_to_ship')), 'Ship')
  assert.equal(flow.primaryAction(card('shipped')), null)
  assert.equal(flow.primaryAction(card('shipped', { delivery_confirmed_at: '2026-08-02T12:00:00Z' })), 'Close')
})

test('Process payload contains no client-selected destination', () => {
  assert.deepEqual(flow.previewPayloadForCard(card('new'), 'Process'), {
    action: 'board.process.preview', sourceType: 'drop', sourceId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', expectedVersion: 0,
  })
})

test('payment and invitation exceptions remain visible as attention copy', () => {
  assert.match(flow.cardStatusLine(card('awaiting_payment', { payment_status: 'failed' })), /needs attention/i)
  assert.match(flow.cardStatusLine(card('ready_to_invite', { invitation_delivery_status: 'failed' })), /review required/i)
})
