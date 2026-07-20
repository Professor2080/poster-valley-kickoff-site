import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const originalSql = await readFile(new URL('../supabase/migrations/20260720110000_admin_operational_actions.sql', import.meta.url), 'utf8')
const fixSql = await readFile(new URL('../supabase/migrations/20260720165432_admin_operational_actions_runtime_fix.sql', import.meta.url), 'utf8')

function applyFunction(sql) {
  const start = sql.indexOf('create or replace function public.admin_a3_apply_action(')
  assert.notEqual(start, -1, 'admin_a3_apply_action replacement is required')
  const end = sql.indexOf('end $$;', start)
  assert.notEqual(end, -1, 'admin_a3_apply_action replacement must be complete')
  return sql.slice(start, end + 'end $$;'.length)
}

const originalApply = applyFunction(originalSql)
const fixedApply = applyFunction(fixSql)

test('runtime fix is additive and schema-qualifies every restricted-path pgcrypto call', () => {
  assert.match(originalApply, /encode\(digest\(gen_random_bytes\(32\),'sha256'\),'hex'\)/)
  assert.match(fixedApply, /encode\(extensions\.digest\(extensions\.gen_random_bytes\(32\),'sha256'\),'hex'\)/)
  assert.doesNotMatch(fixedApply, /(?<!extensions\.)\b(?:digest|gen_random_bytes|crypt|gen_salt|hmac|pgp_[a-z_]+|uuid_generate_[a-z0-9_]+)\s*\(/i)

  const expected = originalApply.replace('digest(gen_random_bytes(32)', 'extensions.digest(extensions.gen_random_bytes(32)')
  assert.equal(fixedApply, expected, 'the additive replacement must preserve the accepted A3 function body apart from explicit pgcrypto schemas')
})

test('runtime replacement preserves the restricted SECURITY DEFINER boundary', () => {
  assert.match(fixedApply, /language plpgsql security definer set search_path = public, pg_temp as \$\$/i)
  assert.doesNotMatch(fixedApply, /set search_path\s*=\s*[^\n]*extensions/i)
  assert.match(fixSql, /revoke all on function public\.admin_a3_apply_action\(uuid,text,text,text,jsonb,jsonb\) from public, anon, authenticated;/i)
  assert.match(fixSql, /grant execute on function public\.admin_a3_apply_action\(uuid,text,text,text,jsonb,jsonb\) to service_role;/i)
  assert.doesNotMatch(fixSql, /grant\s+execute[\s\S]*\bto\s+(?:public|anon|authenticated)\b/i)
})

test('runtime fix adds advisor-requested foreign-key covering indexes', () => {
  assert.match(fixSql, /create index if not exists manual_shipping_quotes_approved_by_idx\s+on public\.manual_shipping_quotes\(approved_by\);/i)
  assert.match(fixSql, /create index if not exists email_delivery_events_actor_user_id_idx\s+on public\.email_delivery_events\(actor_user_id\);/i)
})
