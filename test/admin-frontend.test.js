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

test('production adminReadUrl permits only frozen resource filters', () => {
  assert.equal(contracts.adminReadUrl('orders', 25, 0, { status: 'paid', email: 'not-allowed', entity_type: 'event' }), '/api/admin/read?resource=orders&limit=25&offset=0&status=paid')
  assert.equal(contracts.adminReadUrl('events', 25, 10, { entity_type: 'order', entity_id: 'abc', status: 'paid' }), '/api/admin/read?resource=events&limit=25&offset=10&entity_type=order&entity_id=abc')
})
test('production boundedOffset handles previous and next page boundaries', () => {
  assert.equal(contracts.boundedOffset(0, 25, 100, 'previous'), 0); assert.equal(contracts.boundedOffset(25, 25, 100, 'previous'), 0); assert.equal(contracts.boundedOffset(0, 25, 25, 'next'), 0); assert.equal(contracts.boundedOffset(0, 25, 26, 'next'), 25)
})
test('production API sends bearer authorization and generated read URL', async () => {
  const calls = []; const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => { calls.push({ url: String(input), authorization: new Headers(init?.headers).get('Authorization') }); return response(200, { version: 'v1', role: 'operator', items: [], page: { limit: 25, offset: 0, total: 0 } }) }
  try { await api.getAuthorization('access-token'); await api.getAdminRead('payments', 'access-token', 25, 0, { status: 'paid', email: 'forbidden' }) } finally { globalThis.fetch = originalFetch }
  assert.deepEqual(calls, [{ url: '/api/admin/authorization', authorization: 'Bearer access-token' }, { url: contracts.adminReadUrl('payments', 25, 0, { status: 'paid', email: 'forbidden' }), authorization: 'Bearer access-token' }])
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
