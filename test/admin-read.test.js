import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const savedFetch = globalThis.fetch
const savedUrl = process.env.SUPABASE_URL
const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key'

function response() { return { statusCode: 0, payload: null, headers: {}, status(c) { this.statusCode = c; return this }, setHeader(k, v) { this.headers[k] = v }, end(b) { this.payload = JSON.parse(b) } } }
function request(query = {}, token = 'good') { return { method: 'GET', query, headers: token === null ? {} : { authorization: `Bearer ${token}` } } }

before(() => {
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/auth/v1/user') {
      if (options.headers.Authorization === 'Bearer expired') return new Response('{}', { status: 401 })
      return new Response(JSON.stringify({ id: options.headers.Authorization.replace('Bearer ', '') }), { status: 200 })
    }
    if (parsed.pathname.endsWith('/admin_roles')) {
      const user = parsed.searchParams.get('user_id')
      return new Response(JSON.stringify(user.includes('nonadmin') ? [] : [{ role: user.includes('operator') ? 'operator' : 'manager' }]), { status: 200 })
    }
    if (parsed.pathname.endsWith('/drop_interest_requests')) {
      assert.equal(parsed.searchParams.get('select'), 'id,created_at,drop_slug,preferred_format,quantity,country_code,status,reservation_status')
      return new Response(JSON.stringify([{ id: 'test-row', status: 'new' }]), { status: 200, headers: { 'content-range': '0-0/1' } })
    }
    throw new Error(`Unexpected request ${url}`)
  }
})
after(() => { globalThis.fetch = savedFetch; if (savedUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = savedUrl; if (savedKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey })

const { default: read } = await import('../api/admin/read.js')
const { default: authorization } = await import('../api/admin/authorization.js')

test('admin reads reject missing, expired, and non-admin sessions', async () => {
  for (const [token, status, code] of [[null, 401, 'unauthenticated'], ['expired', 401, 'invalid_session'], ['nonadmin', 403, 'not_admin']]) {
    const res = response(); await read(request({ resource: 'reservations' }, token), res)
    assert.equal(res.statusCode, status); assert.equal(res.payload.error.code, code)
  }
})

test('read API is paginated, allowlisted, and PII-minimized', async () => {
  const res = response(); await read(request({ resource: 'reservations', limit: '1', offset: '0', status: 'new', email: 'ignored@example.test' }), res)
  assert.equal(res.statusCode, 200); assert.equal(res.payload.version, 'v1'); assert.deepEqual(res.payload.page, { limit: 1, offset: 0, total: 1 }); assert.equal('email' in res.payload.items[0], false)
  const bad = response(); await read(request({ resource: 'reservations', limit: '101' }), bad); assert.equal(bad.statusCode, 400)
})

test('operator can use read contracts but cannot satisfy manager-only authorization checks', async () => {
  const res = response(); await authorization(request({}, 'operator'), res); assert.equal(res.statusCode, 200); assert.equal(res.payload.role, 'operator')
  const { requireAdmin, AdminRequestError } = await import('../api/_admin.js')
  await assert.rejects(() => requireAdmin(request({}, 'operator'), 'manager'), (error) => error instanceof AdminRequestError && error.code === 'insufficient_role')
})
