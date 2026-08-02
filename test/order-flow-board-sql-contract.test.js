import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(new URL('../supabase/migrations/20260802192136_order_flow_board.sql', import.meta.url), 'utf8')

test('order-flow work state is RLS-protected and server-role only', () => {
  assert.match(sql, /create table public\.admin_order_flow_state/)
  assert.match(sql, /alter table public\.admin_order_flow_state enable row level security/)
  assert.match(sql, /revoke all on table public\.admin_order_flow_state from public, anon, authenticated, service_role/)
  assert.match(sql, /grant select on table public\.admin_order_flow_state, public\.admin_order_flow_v1, public\.admin_order_flow_drop_v1 to service_role/)
})

test('paid stage requires complete exact Mollie webhook evidence', () => {
  for (const evidence of ["provider = 'mollie'", "status = 'paid'", 'provider_payment_id is not null', 'webhook_received_at is not null', 'paid_at is not null', 'p.amount = customer_order.total_amount', 'p.currency = customer_order.currency']) assert.match(sql, new RegExp(evidence.replaceAll('.', '\\.')))
  assert.doesNotMatch(sql, /update public\.payments[\s\S]{0,300}set status/i)
})

test('Process only writes board work state and the server derives its destination', () => {
  assert.match(sql, /when effective_processed_at is null then 'new'/)
  assert.match(sql, /if p_action = 'board\.process'/)
  assert.match(sql, /insert into public\.admin_order_flow_state\(drop_interest_request_id, processed_at, processed_by, version\)/)
  assert.doesNotMatch(sql, /update public\.drop_interest_requests[\s\S]{0,300}(reservation_status|status)/i)
})

test('drop open, delivery confirmation and closing are manager-gated and audited', () => {
  assert.match(sql, /p_action in \('drop\.open', 'delivery\.confirm', 'board\.close'\)/)
  assert.match(sql, /role = 'manager'/)
  assert.match(sql, /from public\.drop_interest_requests r[\s\S]*r\.drop_slug = product\.drop_slug[\s\S]*for update;[\s\S]*select d\.qualified_units/)
  assert.match(sql, /delivery_not_confirmed/)
  assert.match(sql, /'drop\.invitations_opened'/)
  assert.match(sql, /'delivery\.confirmed'/)
  assert.match(sql, /'order_flow\.closed'/)
})

test('provider payment event is emitted only after confirmed evidence exists', () => {
  assert.match(sql, /new\.provider = 'mollie' and new\.status = 'paid'/)
  assert.match(sql, /new\.provider_payment_id is not null and new\.webhook_received_at is not null and new\.paid_at is not null/)
  assert.match(sql, /values \('provider', 'payment\.paid', 'order'/)
})
