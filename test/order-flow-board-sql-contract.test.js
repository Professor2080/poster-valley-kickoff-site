import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const original = await readFile(new URL('../supabase/migrations/20260802192136_order_flow_board.sql', import.meta.url), 'utf8')
const update = await readFile(new URL('../supabase/migrations/20260804103202_simplify_order_flow_invitation_thresholds.sql', import.meta.url), 'utf8')

test('order-flow work state remains RLS-protected and server-role only', () => {
  assert.match(original, /create table public\.admin_order_flow_state/)
  assert.match(original, /alter table public\.admin_order_flow_state enable row level security/)
  assert.match(original, /revoke all on table public\.admin_order_flow_state from public, anon, authenticated, service_role/)
})

test('paid stage still requires complete exact Mollie webhook evidence', () => {
  for (const evidence of ["provider = 'mollie'", "status = 'paid'", 'provider_payment_id is not null', 'webhook_received_at is not null', 'paid_at is not null', 'p.amount = customer_order.total_amount', 'p.currency = customer_order.currency']) assert.match(update, new RegExp(evidence.replaceAll('.', '\\.')))
  assert.doesNotMatch(update, /update public\.payments[\s\S]{0,300}set status/i)
})

test('active projection removes Ready to invite and sends Process directly to Interest', () => {
  assert.match(update, /when effective_processed_at is null then 'new'[\s\S]*else 'interest'/)
  assert.match(update, /'nextStage', 'interest'/)
  assert.doesNotMatch(update, /when drop_lifecycle_mode = 'preorder' then 'ready_to_invite'/)
  assert.doesNotMatch(update, /p_stage not in \([^)]*ready_to_invite/)
})

test('threshold Attention is derived from current Interest state and disappears after invitation delivery', () => {
  assert.match(update, /staged\.stage = 'interest'[\s\S]*staged\.invitation_sent_at is null[\s\S]*progress\.threshold_reached/)
  assert.match(update, /invitation_delivery_status in \('failed', 'suppressed'\)/)
  assert.doesNotMatch(update, /update public\.admin_order_flow_state[\s\S]{0,200}attention/i)
})

test('invitation preview reuses the stored per-drop threshold without gating send', () => {
  assert.match(update, /create or replace function public\.admin_a32_preview_action/)
  for (const field of ['productionThreshold', 'qualifiedUnits', 'unitsNeeded', 'thresholdReached']) assert.match(update, new RegExp(`'${field}'`))
  assert.doesNotMatch(update, /p_action like 'invitation\.%'[\s\S]{0,1000}qualified_units\s*</i)
})

test('threshold changes are manager-only, version-bound, idempotent and audited', () => {
  assert.match(update, /create or replace function public\.admin_order_flow_set_threshold/)
  assert.match(update, /role = 'manager'/)
  assert.match(update, /new_threshold is null or new_threshold not between 1 and 100000/)
  assert.match(update, /product\.updated_at is distinct from \(p_request->>'expectedUpdatedAt'\)::timestamptz/)
  assert.match(update, /product\.updated_at <> \(p_request->>'expectedUpdatedAt'\)::timestamptz/)
  assert.match(update, /admin_operation_idempotency/)
  assert.match(update, /'drop\.production_threshold_changed'/)
  assert.match(update, /grant execute on function public\.admin_order_flow_set_threshold[^;]+to service_role/s)
})

test('Process only writes board work state and existing delivery/close audits remain authoritative', () => {
  assert.match(original, /insert into public\.admin_order_flow_state\(drop_interest_request_id, processed_at, processed_by, version\)/)
  assert.match(original, /'delivery\.confirmed'/)
  assert.match(original, /'order_flow\.closed'/)
})
