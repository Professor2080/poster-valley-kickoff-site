import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [foundation, runtimeFix, hardening] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260720110000_admin_operational_actions.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260720165432_admin_operational_actions_runtime_fix.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260729120000_shipping_confirmation_safety.sql', import.meta.url), 'utf8'),
])

function section(source, start, end) {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `missing SQL section: ${start}`)
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : source.length
  assert.notEqual(endIndex, -1, `missing SQL terminator: ${end}`)
  return source.slice(startIndex, endIndex)
}

const guard = section(hardening, 'create or replace function public.admin_shipping_confirmation_guard', 'revoke all on function public.admin_shipping_confirmation_guard')
const preview = section(hardening, 'create or replace function public.admin_a32_preview_action', 'create or replace function public.admin_a32_apply_action')
const apply = section(hardening, 'create or replace function public.admin_a32_apply_action', 'create or replace function public.admin_a32_claim_delivery')
const claim = section(hardening, 'create or replace function public.admin_a32_claim_delivery', 'create or replace function public.admin_a32_delivery_payload')
const payload = section(hardening, 'create or replace function public.admin_a32_delivery_payload', 'create or replace function public.admin_a32_complete_delivery')
const completeWrapper = section(hardening, 'create or replace function public.admin_a32_complete_delivery', 'revoke all on function public.admin_a32_preview_action')
const effectiveApply = section(runtimeFix, 'create or replace function public.admin_a3_apply_action', 'revoke all on function public.admin_a3_apply_action')
const effectiveComplete = section(foundation, 'create or replace function public.admin_a3_complete_delivery', 'revoke all on function public.admin_a3_replay_action')

test('shipping transition and retry are manager-only in every server-side phase', () => {
  assert.match(guard, /role = 'manager' and revoked_at is null/)
  assert.match(guard, /shipping\.reconciliation\.preview/)
  assert.match(guard, /shipping\.reconciliation\.resolve/)
  assert.match(guard, /p_action in \('fulfilment\.preview', 'fulfilment\.transition'\)[\s\S]*targetStatus' = 'shipped'/)
  assert.match(guard, /message = 'insufficient_role'/)
  for (const deliveryPhase of [claim, payload, completeWrapper]) {
    assert.match(deliveryPhase, /a\.template in \('order_invitation', 'shipping_confirmation'\)/)
    assert.match(deliveryPhase, /role = 'manager'/)
  }
})

test('expected fulfilment status and version are rechecked under the mutation lock', () => {
  assert.match(guard, /p_request->>'expectedStatus'/)
  assert.match(guard, /p_request->>'expectedVersion'[\s\S]*\^\[0-9\]\+\$/)
  assert.match(guard, /where id = \(p_request->>'orderId'\)::uuid for update/)
  assert.match(guard, /o\.fulfilment_status <> p_request->>'expectedStatus'/)
  assert.match(guard, /o\.fulfilment_version <> \(p_request->>'expectedVersion'\)::bigint/)
  assert.match(preview, /admin_shipping_confirmation_guard\(p_actor, p_action, p_request, false\)/)
  assert.match(apply, /admin_shipping_confirmation_guard\(p_actor, p_action, p_request, true\)/)
  assert.ok(
    apply.indexOf('admin_shipping_confirmation_guard') < apply.indexOf('admin_a3_apply_action'),
    'the locked guard must run before the underlying mutation',
  )
})

test('carrier and tracking are bounded plain operational identifiers', () => {
  assert.match(guard, /length\(btrim\(p_request->>'carrier'\)\)[\s\S]*between 1 and 120/)
  assert.match(guard, /\^\[A-Za-z0-9\]\[A-Za-z0-9 \.&\(\)\+\/_-\]\*\$/)
  assert.match(guard, /length\(btrim\(p_request->>'trackingNumber'\)\)[\s\S]*between 3 and 160/)
  assert.match(guard, /\^\[A-Za-z0-9\]\[A-Za-z0-9 \._\/-\]\*\$/)
  assert.match(guard, /message = 'tracking_required'/)
  assert.match(guard, /length\(btrim\(o\.carrier\)\)[\s\S]*between 1 and 120/)
  assert.match(guard, /length\(btrim\(o\.tracking_number\)\)[\s\S]*between 3 and 160/)
  assert.match(guard, /message = 'invalid_shipping_details'/)
  assert.match(payload, /from public\.orders[\s\S]*for update/)
  assert.match(payload, /from public\.operational_email_attempts[\s\S]*for update/)
  assert.match(payload, /invalid_shipping_details/)
})

test('effective mutation still requires paid evidence and preserves payment authority', () => {
  assert.match(effectiveApply, /provider='mollie' and status='paid'/)
  assert.match(effectiveApply, /provider_payment_id is not null and webhook_received_at is not null and paid_at is not null/)
  assert.match(effectiveApply, /amount=o\.total_amount and currency=o\.currency/)
  assert.match(effectiveApply, /o\.status <> 'paid' or pay\.id is null[\s\S]*payment_not_confirmed/)
  assert.doesNotMatch(hardening, /update public\.payments|insert into public\.payments/i)
})

test('shipped state, email outbox, audit, and entity history are one database transaction', () => {
  const transition = section(effectiveApply, "elsif p_action='fulfilment.transition' then", "elsif p_action='shipping.retry' then")
  assert.match(transition, /update public\.orders set fulfilment_status=p_request->>'targetStatus',fulfilment_version=fulfilment_version\+1/)
  assert.match(transition, /insert into public\.admin_audit_events/)
  assert.match(transition, /insert into public\.entity_events/)
  assert.match(transition, /insert into public\.operational_email_attempts[\s\S]*'shipping_confirmation','order',o\.id::text/)
  assert.match(transition, /update public\.orders set shipping_email_status='pending'/)
  assert.ok(
    transition.indexOf('update public.orders set fulfilment_status') < transition.indexOf('insert into public.operational_email_attempts'),
    'shipping email preparation follows the guarded fulfilment transition in the same RPC',
  )
})

test('delivery failure preserves shipped and finalizes append-only delivery history', () => {
  assert.match(effectiveComplete, /if a\.template='shipping_confirmation' then[\s\S]*set shipping_email_status=p_delivery_status/)
  assert.doesNotMatch(effectiveComplete, /set fulfilment_status/)
  assert.match(effectiveComplete, /insert into public\.email_delivery_events/)
  assert.match(effectiveComplete, /insert into public\.admin_audit_events/)
  assert.match(effectiveComplete, /insert into public\.entity_events/)
  assert.match(foundation, /create trigger email_delivery_events_no_update before update or delete/)
})

test('retry is separate, idempotent, and cannot repeat fulfilment', () => {
  const retry = section(effectiveApply, "elsif p_action='shipping.retry' then")
  assert.match(retry, /o\.fulfilment_status <> 'shipped'/)
  assert.match(retry, /if a\.delivery_status='sent' then raise exception/)
  assert.match(retry, /if a\.delivery_status='pending' then attempt_id:=a\.id/)
  assert.match(retry, /shipping_confirmation\.retry\.prepared/)
  assert.doesNotMatch(retry, /set fulfilment_status|fulfilment_version=fulfilment_version\+1/)
  assert.match(effectiveApply, /pg_advisory_xact_lock/)
  assert.match(effectiveApply, /prior\.request_hash <> p_request_hash[\s\S]*idempotency_conflict/)
  assert.match(effectiveApply, /prior\.result \|\| jsonb_build_object\('replay',true\)/)
  assert.match(guard, /reconciliation_required/)
  assert.match(claim, /reconciliation_required = true/)
  assert.match(claim, /'reconciliationRequired', true/)
})

test('reconciliation state is persisted and exposed without changing the existing function budget', () => {
  assert.match(hardening, /add column if not exists reconciliation_required boolean not null default false/)
  assert.match(hardening, /create or replace view public\.admin_order_list_v1 with \(security_invoker = true\)/)
  assert.match(hardening, /shipping_reconciliation_required/)
  assert.match(hardening, /grant select on public\.admin_order_list_v1 to service_role/)
})

test('manual reconciliation is confirmation-bound, idempotent, atomic, and sends no email', () => {
  assert.match(preview, /p_action = 'shipping\.reconciliation\.preview'/)
  assert.match(preview, /'suggestedAction', 'shipping\.reconciliation\.resolve'/)
  assert.match(preview, /'providerOutcome', 'uncertain'/)
  assert.match(apply, /p_action = 'shipping\.reconciliation\.resolve'/)
  assert.match(apply, /pg_advisory_xact_lock/)
  assert.match(apply, /prior\.request_hash <> p_request_hash[\s\S]*idempotency_conflict/)
  assert.match(apply, /from public\.orders[\s\S]*for update/)
  assert.match(apply, /from public\.operational_email_attempts[\s\S]*for update/)
  assert.match(apply, /provider_acceptance_confirmed/)
  assert.match(apply, /provider_non_acceptance_confirmed/)
  assert.match(apply, /update public\.operational_email_attempts[\s\S]*delivery_status/)
  assert.match(apply, /update public\.orders set\s+shipping_email_status/)
  assert.match(apply, /insert into public\.email_delivery_events/)
  assert.match(apply, /insert into public\.admin_audit_events/)
  assert.match(apply, /insert into public\.entity_events/)
  assert.match(apply, /manual_reconciliation/)
  assert.match(apply, /inbox_delivery_confirmed/)
  assert.doesNotMatch(apply, /fulfilment_version\s*=\s*fulfilment_version\s*\+\s*1/)
  assert.doesNotMatch(apply, /update public\.payments|insert into public\.payments/i)
  assert.doesNotMatch(apply, /http|resend\.com|net\.http/i)
})

test('manual reconciliation evidence is short and excludes obvious sensitive values', () => {
  assert.match(guard, /evidenceNote/)
  assert.match(guard, /between 10 and 500/)
  assert.match(guard, /\[\[:cntrl:\]\]/)
  assert.match(guard, /position\('@'/)
  assert.match(guard, /https\?/)
  assert.match(guard, /message = 'invalid_reconciliation_evidence'/)
  assert.doesNotMatch(apply, /recipientEmail|shipping_name|address_line1|token_hash/i)
})

test('ambiguous completion keeps the attempt pending and explicitly blocks automatic retry', () => {
  assert.match(completeWrapper, /p_delivery_status = 'pending'/)
  assert.match(completeWrapper, /reconciliation_required = true/)
  assert.match(completeWrapper, /'deliveryStatus', 'pending'/)
  assert.match(completeWrapper, /'reconciliationRequired', true/)
  assert.match(completeWrapper, /'automaticRetryBlocked', true/)
  assert.ok(
    completeWrapper.indexOf('return v_result;')
      < completeWrapper.indexOf('return public.admin_a3_complete_delivery'),
    'pending ambiguity must return before the terminal-delivery delegate',
  )
})

test('new privileged SQL surfaces remain service-only with restricted search paths', () => {
  assert.match(hardening, /security definer set search_path = public, pg_temp/g)
  assert.match(hardening, /revoke all on function public\.admin_shipping_confirmation_guard\(uuid,text,jsonb,boolean\)[\s\S]*from public, anon, authenticated, service_role/)
  for (const name of [
    'admin_a32_preview_action',
    'admin_a32_apply_action',
    'admin_a32_claim_delivery',
    'admin_a32_delivery_payload',
    'admin_a32_complete_delivery',
  ]) {
    assert.match(hardening, new RegExp(`revoke all on function public\\.${name}\\([^;]+from public, anon, authenticated`))
    assert.match(hardening, new RegExp(`grant execute on function public\\.${name}\\([^;]+to service_role`))
  }
  assert.doesNotMatch(hardening, /grant execute[^;]+to (?:anon|authenticated)/i)
})
