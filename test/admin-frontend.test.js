import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'

const temp = await mkdtemp(join(tmpdir(), 'poster-valley-admin-test-'))
async function productionModule(name) {
  const source = await readFile(`src/admin/${name}.ts`, 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText
    .replaceAll("'./contracts'", "'./contracts.mjs'").replaceAll("'./api'", "'./api.mjs'")
  const path = join(temp, `${name}.mjs`); await writeFile(path, output); return import(`file://${path}`)
}
const contracts = await productionModule('contracts')
const api = await productionModule('api')
const session = await productionModule('session')
const dialog = await productionModule('dialog')
const response = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('production read filters are frozen and origin-aware', () => {
  assert.deepEqual(contracts.resourceFilters.orders, ['status', 'payment_status', 'fulfilment_status', 'invitation_id', 'record_origin', 'exclude_origin'])
  assert.equal(contracts.resourceFilters.orders.includes('email'), false)
})
test('production boundedOffset handles previous and next page boundaries', () => {
  assert.equal(contracts.boundedOffset(0, 25, 100, 'previous'), 0); assert.equal(contracts.boundedOffset(25, 25, 100, 'previous'), 0); assert.equal(contracts.boundedOffset(0, 25, 25, 'next'), 0); assert.equal(contracts.boundedOffset(0, 25, 26, 'next'), 25)
})
test('production API sends bearer authorization and uses fixed consolidated status operations', async () => {
  const calls = []; const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => { calls.push({ url: String(input), method: init?.method ?? 'GET', authorization: new Headers(init?.headers).get('Authorization'), body: init?.body ? JSON.parse(String(init.body)) : null }); return response(200, { version: 'v1', role: 'operator', items: [], page: { limit: 25, offset: 0, total: 0 } }) }
  try { await api.getAuthorization('access-token'); await api.getDeliveryConfiguration('access-token'); await api.getAdminRead('payments', 'access-token', 25, 0, { status: 'paid', email: 'forbidden' }) } finally { globalThis.fetch = originalFetch }
  assert.deepEqual(calls, [{ url: '/api/admin/status?operation=authorization', method: 'GET', authorization: 'Bearer access-token', body: null }, { url: '/api/admin/status?operation=delivery', method: 'GET', authorization: 'Bearer access-token', body: null }, { url: '/api/admin/read', method: 'POST', authorization: 'Bearer access-token', body: { resource: 'payments', limit: 25, offset: 0, filters: { status: 'paid', email: 'forbidden' } } }])
})
test('production session verifier does not read before authorization, denies 403, and clears invalid sessions', async () => {
  let authorizeCalls = 0; let cleared = 0; const clear = async () => { cleared++ }
  assert.deepEqual(await session.verifyAdminSession(null, clear, async () => { authorizeCalls++; return { version: 'v1', role: 'operator' } }), { screen: 'login' }); assert.equal(authorizeCalls, 0)
  const userSession = { access_token: 'token' }
  assert.deepEqual(await session.verifyAdminSession(userSession, clear, async () => { throw new api.AdminApiError(403, 'No admin') }), { screen: 'denied' }); assert.equal(cleared, 0)
  assert.deepEqual(await session.verifyAdminSession(userSession, clear, async () => { throw new api.AdminApiError(401, 'Expired') }), { screen: 'login', expired: true }); assert.equal(cleared, 1)
})
test('production read states and timestamp formatting are safe and correct', () => {
  assert.equal(contracts.readViewState({ loading: true, error: '', itemCount: 0 }), 'loading'); assert.equal(contracts.readViewState({ loading: false, error: 'Request failed', itemCount: 0 }), 'error'); assert.equal(contracts.readViewState({ loading: false, error: '', itemCount: 0 }), 'empty'); assert.equal(contracts.readViewState({ loading: false, error: '', itemCount: 1 }), 'ready')
  const timestamp = '2026-07-20T12:34:56.000Z'; assert.notEqual(contracts.formatValue('created_at', timestamp), timestamp); assert.equal(contracts.formatValue('status', 'payment_open'), 'payment open')
})

test('production modal keyboard actions close and retain focus within the dialog', () => {
  assert.equal(dialog.modalKeyAction({ key: 'Escape', shiftKey: false, atFirst: false, atLast: false }), 'close')
  assert.equal(dialog.modalKeyAction({ key: 'Tab', shiftKey: false, atFirst: false, atLast: true }), 'first')
  assert.equal(dialog.modalKeyAction({ key: 'Tab', shiftKey: true, atFirst: true, atLast: false }), 'last')
})
