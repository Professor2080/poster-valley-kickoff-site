import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const migration = await readFile(new URL('../supabase/migrations/20260720090000_admin_auth_data_foundation.sql', import.meta.url), 'utf8')

test('migration establishes protected append-only foundations and product code', () => {
  for (const phrase of ['create table public.admin_roles', 'create table public.admin_audit_events', 'create table public.entity_events', 'create table public.product_registry', "'eurofighter-typhoon-a2'", 'enable row level security', 'admin_audit_events_no_update', 'entity_events_no_update']) assert.match(migration, new RegExp(phrase))
  assert.match(migration, /No INSERT\/UPDATE\/DELETE policies/)
})

test('product lifecycle matches the accepted custom and WooCommerce authority model', () => {
  assert.match(migration, /lifecycle_mode in \('interest', 'preorder', 'in_stock', 'sold_out', 'archived'\)/)
  assert.match(migration, /when 'interest' then 'custom'/)
  assert.match(migration, /when 'preorder' then 'custom'/)
  assert.match(migration, /when 'in_stock' then 'woocommerce'/)
  assert.match(migration, /when 'sold_out' then 'none'/)
  assert.match(migration, /when 'archived' then 'historical'/)
  assert.match(migration, /'eurofighter-typhoon-a2'.*'interest'/)
  assert.doesNotMatch(migration, /lifecycle_status|selling_mode/)
})

test('status compatibility deliberately preserves legacy and reservation values', async () => {
  const doc = await readFile(new URL('../docs/admin-a1-staging-runbook.md', import.meta.url), 'utf8')
  assert.match(doc, /payment_link_sent.*order_invited/)
  assert.match(doc, /non-equivalent|not equivalent/i)
})

test('A1 exposes no payment mutation endpoint and documents provider authority', async () => {
  const read = await readFile(new URL('../api/admin/read.js', import.meta.url), 'utf8')
  assert.doesNotMatch(read, /ensurePost|updateRows|createRow|insertRow/)
  assert.match(await readFile(new URL('../docs/admin-a1-staging-runbook.md', import.meta.url), 'utf8'), /Mollie.*authoritative/i)
})
