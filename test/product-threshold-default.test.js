import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../supabase/migrations/20260802210626_default_drop_production_threshold.sql', import.meta.url), 'utf8')
const board = await readFile(new URL('../src/admin/OrderFlowBoard.tsx', import.meta.url), 'utf8')

test('new drops default omitted and explicit null thresholds to five', () => {
  assert.match(migration, /alter column production_threshold set default 5/i)
  assert.match(migration, /before insert on public\.product_registry[\s\S]*when \(new\.production_threshold is null\)/i)
  assert.match(migration, /new\.production_threshold := 5/i)
})

test('explicit threshold overrides and nullable historical compatibility remain available', () => {
  assert.doesNotMatch(migration, /production_threshold\s+set not null/i)
  assert.doesNotMatch(migration, /before (?:insert or update|update).*product_registry/i)
  assert.match(migration, /where product_code = 'eurofighter-typhoon-a2'[\s\S]*production_threshold is distinct from 5/i)
  assert.doesNotMatch(migration, /update public\.product_registry\s+set production_threshold = 5\s*(?:;|where production_threshold is null)/i)
})

test('the board renders progress and remaining units from the stored drop projection', () => {
  assert.match(board, /drop\.qualified_units}\s*\/\s*{drop\.production_threshold}/)
  assert.match(board, /`Pending drop [^`]*\$\{drop\.units_needed} more needed`/)
  assert.doesNotMatch(board, /eurofighter[^\n]{0,200}(?:\/\s*5|more needed)/i)
})
