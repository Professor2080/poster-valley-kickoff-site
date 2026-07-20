import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

const oldFetch = globalThis.fetch; const oldUrl = process.env.SUPABASE_URL; const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY
process.env.SUPABASE_URL = 'https://supabase.test'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'server-only-test-key'
const response = () => ({ statusCode: 0, body: null, status(code) { this.statusCode = code; return this }, setHeader() { return this }, end(body) { this.body = JSON.parse(body) } })
let rpcCalls = []
before(() => { globalThis.fetch = async (url, init = {}) => { const path = new URL(url).pathname; if (path === '/auth/v1/user') return new Response(JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' })); if (path.endsWith('/admin_roles')) return new Response(JSON.stringify([{ role: 'operator' }])); if (path.includes('/rpc/')) { rpcCalls.push({ path, body: JSON.parse(init.body) }); return new Response(JSON.stringify({ success: true, outcome: 'suppressed' })) } throw new Error(path) } })
after(() => { globalThis.fetch = oldFetch; if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl; if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey })
const { default: handler } = await import('../api/admin/actions.js')
const request = (body, token = 'good') => ({ method: 'POST', body, headers: token ? { authorization: `Bearer ${token}` } : {} })
test('actual handler allows non-mutating preview without confirmation or idempotency key', async () => { rpcCalls=[]; const res=response(); await handler(request({ action: 'invitation.preview', reservationId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }),res); assert.equal(res.statusCode,200); assert.equal(rpcCalls.length,1); assert.match(rpcCalls[0].path,/preview/) })
test('actual handler rejects mutation without explicit confirmation before RPC', async () => { rpcCalls=[]; const res=response(); await handler(request({ action:'invitation.prepare',reservationId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',idempotencyKey:'fixture' }),res); assert.equal(res.statusCode,409); assert.equal(rpcCalls.length,0) })
test('actual handler rejects unauthenticated calls', async () => { const res=response(); await handler(request({ action:'invitation.preview',reservationId:'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' },null),res); assert.equal(res.statusCode,401) })
