import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationName = '20260721083831_a3_1_admin_customer_data_record_origin.sql'
const sql = await readFile(new URL(`../supabase/migrations/${migrationName}`, import.meta.url), 'utf8')

test('A3.1 establishes canonical constrained origin and a conservative legacy backfill', () => {
  assert.match(sql, /create type public\.record_origin as enum \('customer', 'test', 'internal_pilot'\)/i)
  assert.match(sql, /alter column record_origin set default 'customer'[\s\S]*alter column record_origin set not null/i)
  assert.match(sql, /set record_origin = 'customer', record_origin_needs_review = true/i)
  assert.match(sql, /split_part\(coalesce\(email_normalized, email\), '@', 2\)[\s\S]*'\(\^\|\[\.\]\)test\$'/i)
  assert.doesNotMatch(sql, /outlook|gmail|hotmail/i)
  assert.doesNotMatch(sql, /source_path\s*=|internal-live-pilot/i)
  assert.match(sql, /drop_interest_requests_origin_idx/i)
})

test('origin is derived through every commerce and email lineage without rewriting immutable history', () => {
  assert.match(sql, /admin_invitation_list_v1[\s\S]*join public\.drop_interest_requests/i)
  assert.match(sql, /admin_order_list_v1[\s\S]*join public\.drop_interest_requests/i)
  assert.match(sql, /admin_payment_list_v1[\s\S]*join public\.orders[\s\S]*join public\.drop_interest_requests/i)
  assert.match(sql, /operational_email_attempts[\s\S]*add column interest_request_id uuid references public\.drop_interest_requests/i)
  assert.match(sql, /admin_a31_set_email_lineage[\s\S]*order_invitation[\s\S]*order/i)
  assert.doesNotMatch(sql, /alter table public\.(email_delivery_events|admin_audit_events|entity_events)[\s\S]*record_origin/i)
})

test('manager origin change is confirmed, versioned, idempotent, serialized and atomic', () => {
  const functionSql = sql.slice(sql.indexOf('create or replace function public.admin_a31_change_origin'))
  assert.match(functionSql, /role = 'manager'/i)
  assert.match(functionSql, /p_confirmation <> 'CONFIRM'/i)
  assert.match(functionSql, /nullif\(btrim\(p_reason\), ''\) is null/i)
  assert.match(functionSql, /p_reason ~\* '@\|https\?:\/\/'[\s\S]*p_reason ~ '\[\[:cntrl:\]\]'/i)
  assert.match(functionSql, /pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended/i)
  assert.match(functionSql, /admin_operation_idempotency[\s\S]*request_hash <> p_request_hash[\s\S]*idempotency_conflict/i)
  assert.match(functionSql, /for update[\s\S]*record_origin_version <> p_expected_version[\s\S]*stale_transition/i)
  assert.match(functionSql, /update public\.drop_interest_requests set record_origin = p_new_origin[\s\S]*record_origin_version = record_origin_version \+ 1/i)
  assert.match(functionSql, /insert into public\.admin_audit_events[\s\S]*insert into public\.entity_events[\s\S]*update public\.admin_operation_idempotency/i)
  assert.match(functionSql, /previous_origin[\s\S]*new_origin[\s\S]*reason[\s\S]*affected_records/i)
  assert.doesNotMatch(functionSql, /full_name|address_line1|shipping_name|token_hash/i)
})

test('privileged origin and shipping RPCs retain restricted service-role-only boundaries', () => {
  for (const name of ['admin_a31_preview_origin_change', 'admin_a31_change_origin', 'admin_a31_assert_shipping_ready']) {
    assert.match(sql, new RegExp(`function public\\.${name}[\\s\\S]*security definer set search_path = public, pg_temp`, 'i'))
    assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\([^;]+ from public, anon, authenticated`, 'i'))
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\([^;]+ to service_role`, 'i'))
  }
  assert.match(sql, /revoke all on public\.admin_reservation_list_v1[\s\S]*from public, anon, authenticated/i)
  assert.match(sql, /grant select on public\.admin_reservation_list_v1[\s\S]*to service_role/i)
})

test('address additions preserve international checkout and enforce paid and shipped safety', () => {
  assert.match(sql, /add column shipping_company text/i)
  assert.doesNotMatch(sql, /shipping_phone|phone text/i)
  assert.match(sql, /admin_a31_order_address_complete[\s\S]*shipping_name[\s\S]*email[\s\S]*address_line1[\s\S]*postal_code[\s\S]*city[\s\S]*shipping_country_code/i)
  assert.match(sql, /shipping_country_code not in \('US', 'CA', 'AU'\)[\s\S]*region/i)
  assert.match(sql, /orders_require_complete_shipping_address/i)
  assert.match(sql, /admin_a31_protect_paid_address[\s\S]*provider_payment_id is not null[\s\S]*webhook_received_at is not null[\s\S]*paid_at is not null/i)
  assert.match(sql, /raise exception using message = 'paid_address_immutable'/i)
})

test('service list projections contain only lifecycle-appropriate customer data', () => {
  const reservations = sql.slice(sql.indexOf('create view public.admin_reservation_list_v1'), sql.indexOf('create view public.admin_invitation_list_v1'))
  const orders = sql.slice(sql.indexOf('create view public.admin_order_list_v1'), sql.indexOf('create view public.admin_payment_list_v1'))
  assert.match(reservations, /customer_name[\s\S]*masked_email/i)
  assert.doesNotMatch(reservations, /shipping_address|address_line1/i)
  assert.match(orders, /customer_name[\s\S]*payment_status[\s\S]*fulfilment_status[\s\S]*shipping_country_code/i)
  assert.doesNotMatch(orders, /address_line1|postal_code|\bo\.email\b/i)
})
