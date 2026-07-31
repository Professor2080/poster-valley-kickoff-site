import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const sql = await readFile(new URL('../supabase/migrations/20260731113000_schema_baseline_v1.sql', import.meta.url), 'utf8')

function section(start, end) {
  const startIndex = sql.indexOf(start)
  assert.notEqual(startIndex, -1, `missing SQL section: ${start}`)
  const endIndex = end ? sql.indexOf(end, startIndex + start.length) : sql.length
  assert.notEqual(endIndex, -1, `missing SQL section terminator: ${end}`)
  return sql.slice(startIndex, endIndex)
}

const orders = section('create table public.orders', 'create table public.payments')
const claim = section('CREATE OR REPLACE FUNCTION public.payment_start_claim', 'CREATE OR REPLACE FUNCTION public.payment_start_begin_provider')
const beginProvider = section('CREATE OR REPLACE FUNCTION public.payment_start_begin_provider', 'CREATE OR REPLACE FUNCTION public.payment_start_complete')
const complete = section('CREATE OR REPLACE FUNCTION public.payment_start_complete', 'CREATE OR REPLACE FUNCTION public.payment_start_mark_reconciliation')
const reconcile = section('CREATE OR REPLACE FUNCTION public.payment_start_mark_reconciliation', 'CREATE OR REPLACE FUNCTION public.admin_a3_replay_action')

test('baseline enforces one canonical order and one Mollie payment per invitation', () => {
  assert.match(sql, /orders_invitation_id_key UNIQUE \(invitation_id\)/)
  assert.match(sql, /payments_order_id_provider_key UNIQUE \(order_id, provider\)/)
  assert.match(sql, /orders_payment_provider_idempotency_key_key UNIQUE \(payment_provider_idempotency_key\)/)
  assert.match(orders, /payment_request_hash text not null/)
  assert.match(orders, /payment_provider_idempotency_key uuid default gen_random_uuid\(\) not null/)
  assert.match(sql, /orders_payment_request_hash_check CHECK \(payment_request_hash ~ '\^\[a-f0-9\]\{64\}\$'/)
  assert.doesNotMatch(orders, /payment_provider_idempotency_key[^\n]*payment_request_hash/)
})

test('claim locks the invitation, detects payload conflict, and leases exactly one owner', () => {
  assert.match(claim, /order_invitations where id=p_invitation_id for update/)
  assert.match(claim, /orders where invitation_id=i\.id for update/)
  assert.match(claim, /o\.payment_request_hash <> p_request_hash[\s\S]*payment_idempotency_conflict/)
  assert.match(claim, /payment_claim_expires_at=now_at\+interval '2 minutes'/)
  assert.match(claim, /insert into public\.orders[\s\S]*payment_request_hash,payment_start_status,payment_claim_id,payment_claim_expires_at/)
  assert.match(claim, /update public\.order_invitations set status='order_started'/)
})

test('provider begin, completion, and ambiguous outcome transitions are atomic and fail closed', () => {
  assert.match(beginProvider, /payment_start_status <> 'claimed'/)
  assert.match(beginProvider, /payment_start_status='provider_pending'/)
  assert.match(complete, /select \* into pay from public\.payments[\s\S]*for update/)
  assert.match(complete, /insert into public\.payments/)
  assert.match(complete, /update public\.orders set status=next_order_status,payment_start_status='provider_created'/)
  assert.match(complete, /update public\.order_invitations set status=next_invitation_status/)
  assert.match(reconcile, /payment_start_status='reconciliation_required'/)
  assert.match(reconcile, /payment_reconciliation_required_at=now_at/)
  assert.doesNotMatch(reconcile, /insert into public\.payments/)
})

test('all payment-start RPCs are service-only security definers with an empty search path', () => {
  const signatures = [
    'payment_start_claim(uuid,text,uuid,jsonb)',
    'payment_start_begin_provider(uuid,text,uuid)',
    'payment_start_complete(uuid,text,uuid,text,text,numeric,text,text,text,jsonb)',
    'payment_start_mark_reconciliation(uuid,text,uuid)',
  ]
  for (const rpc of [claim, beginProvider, complete, reconcile]) {
    assert.match(rpc, /SECURITY DEFINER/)
    assert.match(rpc, /SET search_path TO ''/)
  }
  assert.match(sql, /revoke all on all functions in schema public from public, anon, authenticated, service_role/)
  for (const signature of signatures) {
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, '\\$&')} to service_role`))
    assert.doesNotMatch(sql, new RegExp(`grant execute on function public\\.${signature.replace(/[()]/g, '\\$&')} to (?:public|anon|authenticated)`))
  }
})
