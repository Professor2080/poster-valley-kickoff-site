import test from 'node:test'
import assert from 'node:assert/strict'

// Mirrors the frozen A1 URL/pagination contract used by the browser client.
const url = (resource, limit, offset, filters = {}) => {
  const allowed = { reservations: ['status', 'reservation_status'], invitations: ['status'], orders: ['status'], payments: ['status'], events: ['entity_type', 'entity_id'], products: ['lifecycle_mode', 'commerce_authority'] }
  const params = new URLSearchParams({ resource, limit: String(limit), offset: String(offset) })
  for (const key of allowed[resource]) if (filters[key]) params.set(key, filters[key])
  return `/api/admin/read?${params}`
}
const next = (offset, limit, total) => offset + limit < total ? offset + limit : offset

test('admin requests use only frozen allowlisted filters and bounded pagination', () => {
  assert.equal(url('orders', 25, 0, { status: 'paid', email: 'nope' }), '/api/admin/read?resource=orders&limit=25&offset=0&status=paid')
  assert.equal(next(0, 25, 25), 0)
  assert.equal(next(0, 25, 26), 25)
})
test('admin frontend contains no operational write controls or service role browser configuration', async () => {
  const source = await (await import('node:fs/promises')).readFile('src/admin/AdminApp.tsx', 'utf8')
  const client = await (await import('node:fs/promises')).readFile('src/admin/supabase.ts', 'utf8')
  assert.doesNotMatch(source, /refund|send invitation|mark.*paid|shipping|write action/i)
  assert.doesNotMatch(client, /SERVICE_ROLE|ADMIN_ACTION_SECRET/)
  assert.match(source, /Authorization/)
})
