import assert from 'node:assert/strict'
import { after, test } from 'node:test'

const saved = {
  fetch: globalThis.fetch,
  url: process.env.SUPABASE_URL,
  key: process.env.SUPABASE_SERVICE_ROLE_KEY,
}
const diagnosticPrefix = 'admin_authorization_diagnostic '
const credentialSentinel = 'FIXTURE_CREDENTIAL_MARKER_NEVER_LOG'
const validUrl = 'https://abcdefghijklmnopqrst.supabase.co'
const compactFixture = 'fixture-header.fixture-payload.fixture-signature'
let moduleSequence = 0

process.env.SUPABASE_URL = validUrl
process.env.SUPABASE_SERVICE_ROLE_KEY = credentialSentinel
const { default: authorizationHandler } = await import('../api/admin/authorization.js?diagnostic-handler-test')

after(() => {
  globalThis.fetch = saved.fetch
  if (saved.url === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = saved.url
  if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key
})

function response() {
  return {
    statusCode: 0,
    payload: null,
    headers: {},
    status(code) { this.statusCode = code; return this },
    setHeader(name, value) { this.headers[name] = value; return this },
    end(body) { this.payload = JSON.parse(body) },
  }
}

function request(value = compactFixture) {
  return { method: 'GET', headers: { authorization: `Bearer ${value}`, 'x-vercel-id': 'iad1::fixture-request-1' } }
}

async function captureDiagnostics(run) {
  const lines = []
  const savedLog = console.log
  const savedError = console.error
  console.log = (...parts) => lines.push(parts.join(' '))
  console.error = (...parts) => lines.push(parts.join(' '))
  try {
    const value = await run()
    return { lines, value }
  } finally {
    console.log = savedLog
    console.error = savedError
  }
}

function entries(lines) {
  return lines.map((line) => {
    assert.equal(line.startsWith(diagnosticPrefix), true)
    return JSON.parse(line.slice(diagnosticPrefix.length))
  })
}

function assertCredentialSafe(lines, payload = null) {
  const observable = `${lines.join('\n')}\n${JSON.stringify(payload)}`
  assert.equal(observable.includes(credentialSentinel), false, 'diagnostics and responses must not disclose fixture credentials')
  assert.equal(observable.includes('Authorization'), false, 'diagnostics must not disclose authorization headers')
  assert.equal(observable.includes(validUrl), false, 'diagnostics must not disclose the configured URL')
}

async function loadAdmin(url, key) {
  if (url === undefined) delete process.env.SUPABASE_URL
  else process.env.SUPABASE_URL = url
  if (key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
  else process.env.SUPABASE_SERVICE_ROLE_KEY = key
  moduleSequence += 1
  return import(`../api/_admin.js?diagnostic-case=${moduleSequence}`)
}

async function invokeDirect(options) {
  const url = Object.hasOwn(options, 'url') ? options.url : validUrl
  const key = Object.hasOwn(options, 'key') ? options.key : credentialSentinel
  const { fetchImpl, requiredRole = 'manager' } = options
  const admin = await loadAdmin(url, key)
  const req = request()
  const res = response()
  const diagnostic = admin.createAdminAuthorizationDiagnostic(req)
  const priorFetch = globalThis.fetch
  globalThis.fetch = fetchImpl
  try {
    return await captureDiagnostics(async () => {
      admin.adminAuthorizationPhase(diagnostic, 'request_received')
      admin.adminAuthorizationPhase(diagnostic, 'bearer_shape_validated', { bearerPresent: true, bearerCompact: true })
      try {
        const result = await admin.requireAdmin(req, requiredRole, diagnostic)
        admin.adminAuthorizationPhase(diagnostic, 'authorization_completed')
        return { result, res }
      } catch (error) {
        admin.adminError(res, error, diagnostic)
        return { result: null, res }
      }
    })
  } finally {
    globalThis.fetch = priorFetch
  }
}

function userAndRoleFetch({ role = 'manager', roleResponse } = {}) {
  return async (url) => {
    const path = new URL(url).pathname
    if (path === '/auth/v1/user') return new Response(JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }), { status: 200 })
    if (path.endsWith('/admin_roles')) return roleResponse ?? new Response(JSON.stringify([{ role }]), { status: 200 })
    throw new Error('Unexpected fictitious request path.')
  }
}

test('successful authorization emits every safe phase without disclosing credentials', { concurrency: false }, async () => {
  const priorFetch = globalThis.fetch
  globalThis.fetch = userAndRoleFetch()
  try {
    const res = response()
    const outcome = await captureDiagnostics(() => authorizationHandler(request(), res))
    assert.equal(res.statusCode, 200)
    assert.deepEqual(res.payload, { version: 'v1', role: 'manager' })
    assert.deepEqual(entries(outcome.lines).map(({ phase }) => phase), [
      'request_received',
      'bearer_shape_validated',
      'config_present',
      'url_validated',
      'headers_validated',
      'user_fetch_started',
      'user_fetch_response',
      'user_json_parsed',
      'role_fetch_started',
      'role_fetch_response',
      'role_json_parsed',
      'authorization_completed',
    ])
    assertCredentialSafe(outcome.lines, res.payload)
  } finally {
    globalThis.fetch = priorFetch
  }
})

test('missing configuration stays 503 and invalid fictitious URLs fail before fetch', { concurrency: false }, async () => {
  let fetchCount = 0
  const noFetch = async () => { fetchCount += 1; throw new Error('Fetch must not run.') }
  const missing = await invokeDirect({ key: undefined, fetchImpl: noFetch })
  assert.equal(missing.value.res.statusCode, 503)
  assert.equal(missing.value.res.payload.error.code, 'admin_unavailable')

  for (const url of [`\uFEFF${validUrl}`, ` ${validUrl}`, 'not-a-fictitious-url']) {
    const outcome = await invokeDirect({ url, fetchImpl: noFetch })
    const failed = entries(outcome.lines).at(-1)
    assert.equal(outcome.value.res.statusCode, 500)
    assert.deepEqual(outcome.value.res.payload, { error: { code: 'internal_error', message: 'Admin request failed.' } })
    assert.equal(failed.category, 'INVALID_SUPABASE_URL')
    assert.equal(failed.phase, 'failed')
    assertCredentialSafe(outcome.lines, outcome.value.res.payload)
  }
  assert.equal(fetchCount, 0)
})

test('invalid fictitious service-role headers are classified without logging their value', { concurrency: false }, async () => {
  let fetchCount = 0
  const noFetch = async () => { fetchCount += 1; throw new Error('Fetch must not run.') }
  for (const key of [`${credentialSentinel}\uFEFF`, `${credentialSentinel}\r\ninvalid`]) {
    const outcome = await invokeDirect({ key, fetchImpl: noFetch })
    const records = entries(outcome.lines)
    const headerPhase = records.find(({ phase }) => phase === 'headers_validated')
    const failed = records.at(-1)
    assert.equal(headerPhase.headerConstructible, false)
    assert.equal(failed.category, 'INVALID_SERVICE_ROLE_HEADER')
    assert.equal(outcome.value.res.statusCode, 500)
    assertCredentialSafe(outcome.lines, outcome.value.res.payload)
  }
  assert.equal(fetchCount, 0)
})

test('transport, upstream status, and user response parsing remain distinguishable', { concurrency: false }, async () => {
  const transport = await invokeDirect({ fetchImpl: async () => { throw new TypeError(`fictitious transport ${credentialSentinel}`) } })
  const transportFailure = entries(transport.lines).at(-1)
  assert.equal(transportFailure.category, 'USER_FETCH_TRANSPORT_FAILURE')
  assert.equal(transportFailure.exceptionName, 'TypeError')
  assert.match(transportFailure.stackLocation, /^api\/_admin\.js:\d+:\d+$/)
  assert.equal(transport.value.res.statusCode, 500)
  assertCredentialSafe(transport.lines, transport.value.res.payload)

  const upstream = await invokeDirect({ fetchImpl: async () => new Response('{}', { status: 401 }) })
  const upstreamEntries = entries(upstream.lines)
  assert.equal(upstream.value.res.statusCode, 401)
  assert.equal(upstream.value.res.payload.error.code, 'invalid_session')
  assert.equal(upstreamEntries.at(-1).phase, 'user_fetch_response')
  assert.equal(upstreamEntries.at(-1).upstreamStatus, 401)
  assert.equal(upstreamEntries.some(({ phase }) => phase === 'failed'), false)
  assertCredentialSafe(upstream.lines, upstream.value.res.payload)

  const parse = await invokeDirect({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError(`fictitious JSON ${credentialSentinel}`) } }) })
  const parseFailure = entries(parse.lines).at(-1)
  assert.equal(parseFailure.category, 'USER_RESPONSE_PARSE_FAILURE')
  assert.equal(parseFailure.upstreamStatus, 200)
  assert.equal(parse.value.res.statusCode, 500)
  assertCredentialSafe(parse.lines, parse.value.res.payload)
})

test('role response, role transport, and role parsing retain manager authorization semantics', { concurrency: false }, async () => {
  const success = await invokeDirect({ fetchImpl: userAndRoleFetch() })
  assert.deepEqual(success.value.result, { userId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', role: 'manager' })
  assert.equal(entries(success.lines).at(-1).phase, 'authorization_completed')
  assertCredentialSafe(success.lines)

  let call = 0
  const transport = await invokeDirect({ fetchImpl: async () => {
    call += 1
    if (call === 1) return new Response(JSON.stringify({ id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }), { status: 200 })
    throw new TypeError(`fictitious role transport ${credentialSentinel}`)
  } })
  assert.equal(entries(transport.lines).at(-1).category, 'ROLE_FETCH_TRANSPORT_FAILURE')
  assert.equal(transport.value.res.statusCode, 500)
  assertCredentialSafe(transport.lines, transport.value.res.payload)

  const roleParse = await invokeDirect({ fetchImpl: userAndRoleFetch({ roleResponse: { ok: true, status: 200, json: async () => { throw new SyntaxError(`fictitious role JSON ${credentialSentinel}`) } } }) })
  const roleParseFailure = entries(roleParse.lines).at(-1)
  assert.equal(roleParseFailure.category, 'ROLE_RESPONSE_PARSE_FAILURE')
  assert.equal(roleParseFailure.upstreamStatus, 200)
  assert.equal(roleParse.value.res.statusCode, 500)
  assertCredentialSafe(roleParse.lines, roleParse.value.res.payload)
})

test('unexpected runtime errors stay generic and never expose raw error messages or stacks', { concurrency: false }, async () => {
  const res = response()
  const req = {
    method: 'GET',
    get headers() { throw new RangeError(`fictitious runtime ${credentialSentinel}`) },
  }
  const outcome = await captureDiagnostics(() => authorizationHandler(req, res))
  const failed = entries(outcome.lines).at(-1)
  assert.equal(failed.category, 'UNEXPECTED_RUNTIME_FAILURE')
  assert.equal(failed.exceptionName, 'RangeError')
  assert.equal(res.statusCode, 500)
  assert.deepEqual(res.payload, { error: { code: 'internal_error', message: 'Admin request failed.' } })
  assertCredentialSafe(outcome.lines, res.payload)
})

test('response setup failures receive their stable safe category', { concurrency: false }, async () => {
  let fetchCount = 0
  const priorFetch = globalThis.fetch
  globalThis.fetch = async () => { fetchCount += 1; throw new Error('Fetch must not run.') }
  const res = {
    setHeader() { throw new TypeError(`fictitious response setup ${credentialSentinel}`) },
  }
  try {
    const outcome = await captureDiagnostics(async () => {
      await assert.rejects(() => authorizationHandler(request(), res))
    })
    const failed = entries(outcome.lines).at(-1)
    assert.equal(failed.category, 'RESPONSE_SETUP_FAILURE')
    assert.equal(failed.exceptionName, 'TypeError')
    assert.match(failed.stackLocation, /^api\/_admin\.js:\d+:\d+$/)
    assert.equal(fetchCount, 0)
    assertCredentialSafe(outcome.lines)
  } finally {
    globalThis.fetch = priorFetch
  }
})
