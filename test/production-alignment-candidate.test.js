import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const candidate = readFileSync(
  new URL('../supabase/production-alignment-candidates/production_alignment_pr20.sql', import.meta.url),
  'utf8',
)
const baseline = readFileSync(
  new URL('../supabase/migrations/20260731113000_schema_baseline_v1.sql', import.meta.url),
  'utf8',
)
const plan = readFileSync(
  new URL('../supabase/production-alignment-candidates/production_history_reconciliation_plan.md', import.meta.url),
  'utf8',
)

function functionDefinition(sql, name) {
  const normalized = sql.replace(/\r\n/gu, '\n')
  const start = normalized.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  assert.notEqual(start, -1, `${name} must exist`)
  const terminator = 'end $function$\n;'
  const end = normalized.indexOf(terminator, start)
  assert.notEqual(end, -1, `${name} must have a stable end boundary`)
  return normalized.slice(start, end + terminator.length).trim()
}

test('Production alignment copies all four canonical payment RPCs byte-for-byte', () => {
  const functions = [
    'payment_start_claim',
    'payment_start_begin_provider',
    'payment_start_complete',
    'payment_start_mark_reconciliation',
  ]

  for (const name of functions) {
    assert.equal(functionDefinition(candidate, name), functionDefinition(baseline, name))
  }
})

test('Production alignment is fail-closed and does not touch migration history or remove data objects', () => {
  assert.match(candidate, /pr20_alignment_unexpected_migration_history/)
  assert.match(candidate, /lock table public\.order_invitations, public\.orders, public\.payments/)
  assert.doesNotMatch(candidate, /^\s*(?:drop table|drop schema|truncate\b)/imu)
  assert.doesNotMatch(candidate, /(?:insert|update|delete)\s+(?:into\s+|from\s+)?supabase_migrations\./i)
  assert.doesNotMatch(candidate, /update\s+public\.orders\s+o\s+set\s+status\s*=/i)
})

test('Production alignment contains the cardinality, RPC, grant, and compatibility contracts', () => {
  for (const contract of [
    'orders_invitation_id_key',
    'orders_payment_provider_idempotency_key_key',
    'payments_order_id_provider_key',
    'orders_payment_request_hash_check',
    'orders_payment_start_state_check',
    'payment_start_claim',
    'payment_start_begin_provider',
    'payment_start_complete',
    'payment_start_mark_reconciliation',
    'payment_start_legacy_compat_defaults_before_insert',
    'revoke all on all functions in schema public from public, anon, authenticated, service_role',
    'alter default privileges for role postgres',
  ]) {
    assert.ok(candidate.includes(contract), `missing contract: ${contract}`)
  }
})

test('History reconciliation is metadata-only, reversible, and never runs schema SQL', () => {
  assert.match(plan, /20260731113000 --status applied/)
  assert.match(plan, /20260731193947 --status applied/)
  assert.equal((plan.match(/--status reverted --db-url/g) ?? []).length, 9)
  assert.match(plan, /db push --dry-run/)
  assert.doesNotMatch(plan, /db push --db-url/)
  assert.doesNotMatch(plan, /^npm\.cmd .* migration (?:fetch|new)/mu)
})
