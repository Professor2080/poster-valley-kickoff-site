import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(new URL('../supabase/migrations/20260720110000_admin_operational_actions.sql', import.meta.url), 'utf8')

function section(start, end) {
  const startIndex = sql.indexOf(start)
  assert.notEqual(startIndex, -1, `missing SQL section: ${start}`)
  const endIndex = end ? sql.indexOf(end, startIndex + start.length) : sql.length
  assert.notEqual(endIndex, -1, `missing SQL section terminator: ${end}`)
  return sql.slice(startIndex, endIndex)
}

function ordered(source, snippets) {
  let cursor = -1
  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor + 1)
    assert.ok(next > cursor, `expected ordered SQL snippet: ${snippet}`)
    cursor = next
  }
}

const attemptsTable = section('create table if not exists public.operational_email_attempts', 'create table if not exists public.email_delivery_events')
const emailEventsTable = section('create table if not exists public.email_delivery_events', 'create table if not exists public.admin_operation_idempotency')
const quoteTrigger = section('create or replace function public.validate_order_manual_quote()', 'create or replace function public.admin_a3_preview_action')
const replayRpc = section('create or replace function public.admin_a3_replay_action', 'create or replace function public.admin_a3_preview_action')
const previewRpc = section('create or replace function public.admin_a3_preview_action', 'create or replace function public.admin_a3_apply_action')
const applyRpc = section('create or replace function public.admin_a3_apply_action', 'create or replace function public.admin_a3_claim_delivery')
const claimRpc = section('create or replace function public.admin_a3_claim_delivery', 'create or replace function public.admin_a3_delivery_payload')
const payloadRpc = section('create or replace function public.admin_a3_delivery_payload', 'create or replace function public.admin_a3_complete_delivery')
const completeRpc = section('create or replace function public.admin_a3_complete_delivery', '-- Rollback:')

test('SQL serializes the complete idempotency lifecycle and distinguishes replay from conflict', () => {
  ordered(applyRpc, [
    'pg_advisory_xact_lock',
    'select * into prior from public.admin_operation_idempotency',
    "prior.request_hash <> p_request_hash",
    "prior.result || jsonb_build_object('replay',true)",
    'insert into public.admin_operation_idempotency',
    'update public.admin_operation_idempotency set',
  ])
  assert.match(attemptsTable, /unique\s*\(actor_user_id,\s*action,\s*idempotency_key\)/i)
  assert.match(sql, /primary key\s*\(actor_user_id,\s*action,\s*idempotency_key\)/i)
  assert.match(sql, /request_hash text not null check \(request_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/)
  assert.match(completeRpc, /a\.delivery_status <> 'pending'.*prior\.result \|\| jsonb_build_object\('replay',true\)/s)
  assert.match(replayRpc, /prior\.request_hash <> p_request_hash.*idempotency_conflict/s)
  assert.match(replayRpc, /jsonb_build_object\('found',true,'result',prior\.result\)/)
})

test('SQL requires provider-confirmed paid evidence in preview and mutation paths', () => {
  for (const rpc of [previewRpc, applyRpc]) {
    assert.match(rpc, /provider='mollie' and status='paid'/)
    assert.match(rpc, /provider_payment_id is not null and webhook_received_at is not null and paid_at is not null/)
    assert.match(rpc, /amount=o\.total_amount and currency=o\.currency/)
    assert.match(rpc, /o\.status <> 'paid' or pay\.id is null.*payment_not_confirmed/s)
  }
})

test('SQL binds fulfilment confirmation to stale-write version and legal transitions', () => {
  for (const rpc of [previewRpc, applyRpc]) {
    assert.match(rpc, /o\.fulfilment_status <> p_request->>'expectedStatus'/)
    assert.match(rpc, /o\.fulfilment_version <> \(p_request->>'expectedVersion'\)::bigint/)
    assert.match(rpc, /'unfulfilled'.*'ready_to_pack'.*'ready_to_pack'.*'packed'.*'packed'.*'shipped'/s)
  }
  assert.match(applyRpc, /fulfilment_version=fulfilment_version\+1/)
  assert.match(applyRpc, /nullif\(btrim\(p_request->>'carrier'\),'\s*'\) is null.*nullif\(btrim\(p_request->>'trackingNumber'\),'\s*'\) is null/s)
  assert.doesNotMatch(sql, /set fulfilment_status = 'shipped'.*where status = 'shipped'/s)
  assert.match(sql, /orders_shipped_details_check check/)
  assert.doesNotMatch(sql, /orders_shipped_details_check[\s\S]{0,500}not valid/i)
})

test('SQL keeps invitation plaintext tokens out of persistence and gates token activation on confirmed send', () => {
  assert.match(attemptsTable, /token_hash text/)
  assert.doesNotMatch(attemptsTable, /\btoken\s+text\b/i)
  assert.match(attemptsTable, /expires_at timestamptz/)
  assert.match(applyRpc, /encode\(digest\(gen_random_bytes\(32\),'sha256'\),'hex'\)/)
  assert.match(applyRpc, /p_context->>'tokenHash'.*p_context->>'expiresAt'/s)
  assert.match(payloadRpc, /tokenHash',a\.token_hash/)
  assert.match(payloadRpc, /dispatch_claim_id=p_claim_id/)
  assert.match(completeRpc, /a\.template='order_invitation' and p_delivery_status='sent'/)
  ordered(completeRpc, [
    "if a.template='order_invitation' and p_delivery_status='sent' then",
    'set token_hash=a.token_hash,expires_at=a.expires_at',
    "status=case when status in ('draft','expired','sent','opened') then 'sent' else status end",
    "reservation_status=case when reservation_status in ('new','contacted','order_invited') then 'order_invited' else reservation_status end",
    'update public.operational_email_attempts set delivery_status=p_delivery_status',
  ])
  assert.match(applyRpc, /p_context->>'tokenHash'.*~ '\^\[a-f0-9\]\{64\}\$'/s, 'RPC must validate the server-supplied token hash before persisting an attempt')
  assert.match(applyRpc, /\(p_context->>'expiresAt'\)::timestamptz > now_at/, 'RPC must independently require a future invitation expiry')
  assert.match(applyRpc, /\(p_context->>'expiresAt'\)::timestamptz <= now_at \+ interval '30 days'/, 'RPC must bound invitation expiry rather than accepting a permanent token')
  assert.match(applyRpc, /a\.expires_at <= now_at.*token_expired_before_confirmation/s)
  assert.match(applyRpc, /nullif\(btrim\(p_context->>'dropId'\),'\s*'\) is null.*nullif\(btrim\(p_context->>'dropTitle'\),'\s*'\) is null/s)
  assert.match(applyRpc, /\(p_context->>'unitPrice'\)::numeric <= 0.*p_context->>'currency'.*\^\[A-Z\]\{3\}\$/s)
})

test('SQL finalizes email, audit, entity, and idempotency history atomically', () => {
  ordered(completeRpc, [
    'update public.operational_email_attempts set delivery_status=p_delivery_status',
    'insert into public.email_delivery_events',
    'insert into public.admin_audit_events',
    'insert into public.entity_events',
    'update public.admin_operation_idempotency set',
  ])
  assert.match(emailEventsTable, /attempt_id uuid not null unique/)
  assert.match(emailEventsTable, /details jsonb not null.*jsonb_typeof\(details\) = 'object'/s)
  assert.match(sql, /create trigger email_delivery_events_no_update before update or delete/)
  assert.match(completeRpc, /correlation_id,idempotency_key/)
  assert.match(completeRpc, /a\.id,p_idempotency_key/g)
  assert.match(completeRpc, /reservation\.lifecycle\.invited/)
  assert.match(completeRpc, /where result->>'emailAttemptId'=a\.id::text/)
})

test('SQL protects quote replacement and validates the checkout snapshot', () => {
  assert.match(sql, /manual_shipping_quote_id uuid references public\.manual_shipping_quotes\(id\) on delete restrict/)
  assert.match(quoteTrigger, /q\.invitation_id <> new\.invitation_id/)
  assert.match(quoteTrigger, /q\.status <> 'approved' or q\.expires_at <= now\(\)/)
  assert.match(quoteTrigger, /q\.country_code <> new\.shipping_country_code or q\.currency <> new\.currency/)
  assert.match(quoteTrigger, /q\.shipping_amount <> new\.shipping_amount/)
  assert.match(quoteTrigger, /before insert or update of invitation_id, manual_shipping_quote_id, shipping_country_code, currency, shipping_amount on public\.orders/)
  ordered(applyRpc, [
    'where invitation_id=i.id and status=\'approved\' for update',
    "manual_shipping_quote_id=q.id and status in ('awaiting_payment','payment_open','paid')",
    "message='quote_in_use'",
    'update public.manual_shipping_quotes set status=',
    'insert into public.manual_shipping_quotes',
    'update public.order_invitations set updated_at=now_at',
  ])
})

test('SQL creates one shipping delivery attempt and restricts every privileged surface', () => {
  assert.match(applyRpc, /if p_request->>'targetStatus'='shipped' then\s+insert into public\.operational_email_attempts/s)
  assert.match(applyRpc, /'shipping_confirmation','order',o\.id::text/)
  assert.match(applyRpc, /'deliveryStatus','pending'/)
  assert.match(sql, /operational_email_one_pending_entity_idx[\s\S]*where delivery_status = 'pending'/)
  assert.match(claimRpc, /dispatch_lease_expires_at=now_at\+interval '5 minutes'/)
  assert.match(claimRpc, /message='operation_in_progress'/)
  assert.match(applyRpc, /p_action='shipping\.retry'/)

  for (const table of ['manual_shipping_quotes', 'operational_email_attempts', 'email_delivery_events', 'admin_operation_idempotency']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
  }
  const signatures = [
    'admin_a3_replay_action(uuid,text,text,text)',
    'admin_a3_preview_action(uuid,text,jsonb)',
    'admin_a3_apply_action(uuid,text,text,text,jsonb,jsonb)',
    'admin_a3_claim_delivery(uuid,uuid,uuid)',
    'admin_a3_delivery_payload(uuid,uuid,uuid)',
    'admin_a3_complete_delivery(uuid,text,text,text,uuid,uuid,text,text)',
  ]
  for (const signature of signatures) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${signature.replace(/[()]/g, '\\$&')} from public, anon, authenticated`))
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, '\\$&')} to service_role`))
  }
})
