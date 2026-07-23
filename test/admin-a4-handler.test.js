import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY, confirmation: process.env.ADMIN_CONFIRMATION_SECRET }
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key'
process.env.ADMIN_CONFIRMATION_SECRET = 'a4-handler-confirmation-secret-at-least-32-bytes'
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
let role = 'manager'
let calls = []

const ok = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
function installFetch() {
  calls = []
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/auth/v1/user') return ok({ id: actorId })
    if (parsed.pathname === '/rest/v1/admin_roles') return ok(role === 'none' ? [] : [{ role }])
    const rpc = parsed.pathname.split('/').at(-1)
    const body = JSON.parse(init.body)
    calls.push({ rpc, body })
    if (rpc === 'admin_a4_report') return ok({ version: 'v1', generatedAt: '2026-07-22T12:00:00Z', summary: { paidOrders: 1, revenue: [{ currency: 'EUR', amount: 23.7 }] }, byProduct: [], byCountry: [], queues: { fulfilment: [], invitationDelivery: [] } })
    if (rpc === 'admin_a4_export_preview') return ok({ recordCount: 1, exceedsLimit: false, maximumRecords: 2000, contentFingerprint: 'a'.repeat(32) })
    if (rpc === 'admin_a4_export') return ok({ exportId: 'export-1', recordCount: 1, rows: [{ reservation_id: 'reservation-1', created_at: '2026-07-22T10:00:00Z', design_slug: 'test-design', design_title: '+formula', preferred_format: 'A2', quantity: 1, contact_country_code: 'NL', reservation_status: 'new', record_origin: 'test', email: 'forbidden@example.test' }] })
    throw new Error(`Unexpected RPC ${rpc}`)
  }
}
function response() { return { statusCode: 0, body: '', headers: {}, status(code) { this.statusCode = code; return this }, setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this }, end(value) { this.body = value } } }
async function invoke(handler, body, token = 'good') { const res = response(); await handler({ method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res); return res }
const json = (res) => JSON.parse(res.body)

const { default: reporting } = await import('../api/admin/reporting.js?a4-handler')

before(installFetch)
after(() => { globalThis.fetch = saved.fetch; for (const [name, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_SERVICE_ROLE_KEY', saved.key], ['ADMIN_CONFIRMATION_SECRET', saved.confirmation]]) { if (value === undefined) delete process.env[name]; else process.env[name] = value } })

test('authorization happens before every operational reporting RPC', async () => {
  assert.equal((await invoke(reporting, { operation: 'report', preset: '30d', filters: {} }, null)).statusCode, 401)
  assert.equal(calls.length, 0)
  role = 'none'; installFetch(); assert.equal((await invoke(reporting, { operation: 'report', preset: '30d', filters: {} })).statusCode, 403)
  assert.equal(calls.length, 0)
  role = 'operator'; installFetch(); assert.equal((await invoke(reporting, { operation: 'export_preview', exportType: 'orders', preset: '30d', filters: {} })).statusCode, 403)
  assert.equal(calls.length, 0)
  role = 'manager'; installFetch()
})

test('unknown reporting operations are rejected without an operational RPC', async () => {
  const res = await invoke(reporting, { operation: 'arbitrary_sql', preset: '30d', filters: {} })
  assert.equal(res.statusCode, 400)
  assert.equal(json(res).error.code, 'invalid_reporting_operation')
  assert.equal(calls.length, 0)
})

test('report operation returns JSON and passes only normalized fixed filters to the manager RPC', async () => {
  const res = await invoke(reporting, { operation: 'report', preset: '30d', filters: { dropSlug: 'test-design', destinationCountryCode: 'nl', arbitrarySql: 'drop table' } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.headers['content-type'], 'application/json')
  assert.equal(json(res).summary.paidOrders, 1)
  const call = calls.find((entry) => entry.rpc === 'admin_a4_report')
  assert.equal(call.body.p_actor, actorId)
  assert.equal(call.body.p_drop_slug, 'test-design')
  assert.equal(call.body.p_destination_country_code, 'NL')
  assert.equal('arbitrarySql' in call.body, false)
})

test('export preview returns JSON and download returns only allowlisted safe CSV fields', async () => {
  const payload = { exportType: 'reservations', preset: '30d', filters: {} }
  const preview = await invoke(reporting, { ...payload, operation: 'export_preview' })
  assert.equal(preview.statusCode, 200)
  assert.equal(preview.headers['content-type'], 'application/json')
  const reviewed = json(preview)
  const download = await invoke(reporting, { ...payload, operation: 'export_download', confirmationProof: reviewed.confirmation.proof, exportFrom: reviewed.period.from, exportTo: reviewed.period.to })
  assert.equal(download.statusCode, 200)
  assert.equal(download.headers['content-type'], 'text/csv; charset=utf-8')
  assert.match(download.body, /"'\+formula"/)
  assert.doesNotMatch(download.body, /forbidden@example[.]test|email/)
  assert.equal(calls.filter((entry) => entry.rpc === 'admin_a4_export').length, 1)
  assert.equal(calls.find((entry) => entry.rpc === 'admin_a4_export').body.p_expected_fingerprint, 'a'.repeat(32))
})

test('export row cap is enforced before confirmation or data generation', async () => {
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url)
    if (parsed.pathname === '/auth/v1/user') return ok({ id: actorId })
    if (parsed.pathname === '/rest/v1/admin_roles') return ok([{ role: 'manager' }])
    const rpc = parsed.pathname.split('/').at(-1)
    if (rpc === 'admin_a4_export_preview') return ok({ recordCount: 2000, exceedsLimit: true, maximumRecords: 2000, contentFingerprint: 'a'.repeat(32) })
    throw new Error(`Unexpected RPC ${rpc} ${init.body}`)
  }
  const res = await invoke(reporting, { operation: 'export_preview', exportType: 'orders', preset: '30d', filters: {} })
  assert.equal(res.statusCode, 409)
  assert.equal(json(res).error.code, 'export_limit_exceeded')
  installFetch()
})
