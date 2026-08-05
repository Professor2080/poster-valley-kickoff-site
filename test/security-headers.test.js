import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

import authorizationHandler from '../api/admin/authorization.js'

const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))

const GLOBAL_SOURCE = '/(.*)'
const DOCUMENT_SOURCE = '/((?!api/|assets/|posters/).*)'
const PRODUCTION_SUPABASE_ORIGIN = 'https://epqpeoubkbftcvxjbqeo.supabase.co'
const STAGING_SUPABASE_ORIGIN = 'https://stbunwkgvxfwmbjivgos.supabase.co'
const VERCEL_TOOLBAR_ORIGIN = 'https://vercel.live'

function headersFor(source) {
  const rule = config.headers?.find((candidate) => candidate.source === source)
  assert.ok(rule, `missing Vercel header rule for ${source}`)
  return Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]))
}

function parseCsp(value) {
  return new Map(value.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [directive, ...sources] = part.split(/\s+/)
    return [directive, sources]
  }))
}

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

test('global security headers are narrow and do not replace runtime response contracts', () => {
  const headers = headersFor(GLOBAL_SOURCE)
  assert.deepEqual(headers, {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  })

  for (const rule of config.headers) {
    for (const header of rule.headers) {
      assert.equal(['cache-control', 'content-type', 'pragma', 'strict-transport-security', 'vary'].includes(header.key.toLowerCase()), false)
    }
  }
})

test('document routes receive the exact CSP, permissions and clickjacking policy', () => {
  const headers = headersFor(DOCUMENT_SOURCE)
  assert.deepEqual(Object.keys(headers).sort(), ['Content-Security-Policy', 'Permissions-Policy', 'X-Frame-Options'].sort())
  assert.equal(headers['Permissions-Policy'], 'camera=(), geolocation=(), microphone=()')
  assert.equal(headers['X-Frame-Options'], 'DENY')

  const csp = parseCsp(headers['Content-Security-Policy'])
  assert.deepEqual(Object.fromEntries(csp), {
    'default-src': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'script-src': ["'self'", VERCEL_TOOLBAR_ORIGIN],
    'script-src-attr': ["'none'"],
    'style-src': ["'self'", 'https://fonts.googleapis.com', VERCEL_TOOLBAR_ORIGIN, "'unsafe-inline'"],
    'style-src-attr': ["'unsafe-inline'"],
    'font-src': ["'self'", 'https://fonts.gstatic.com', VERCEL_TOOLBAR_ORIGIN, 'https://assets.vercel.com'],
    'img-src': ["'self'", 'data:', 'blob:', VERCEL_TOOLBAR_ORIGIN, 'https://vercel.com'],
    'connect-src': ["'self'", PRODUCTION_SUPABASE_ORIGIN, STAGING_SUPABASE_ORIGIN, VERCEL_TOOLBAR_ORIGIN, 'wss://ws-us3.pusher.com'],
    'frame-src': [VERCEL_TOOLBAR_ORIGIN],
    'upgrade-insecure-requests': [],
  })

  assert.equal(headers['Content-Security-Policy'].includes("'unsafe-eval'"), false)
  assert.equal(headers['Content-Security-Policy'].includes('*'), false)
  assert.equal(csp.get('script-src').includes("'unsafe-inline'"), false)
  assert.deepEqual([...csp].filter(([, sources]) => sources.includes("'unsafe-inline'")).map(([directive]) => directive), ['style-src', 'style-src-attr'])
})

test('document-only policy covers the SPA but excludes API and static assets', () => {
  const pattern = new RegExp(`^${DOCUMENT_SOURCE}$`)
  for (const route of ['/', '/privacy', '/terms', '/admin', '/admin/callback', '/order/example-token', '/designs/eurofighter-typhoon']) {
    assert.equal(pattern.test(route), true, `${route} should receive document headers`)
  }
  for (const route of ['/api/admin/authorization', '/api/mollie/webhook', '/assets/index.js', '/posters/first-drop-preview.webp']) {
    assert.equal(pattern.test(route), false, `${route} should not receive document-only headers`)
  }
})

test('the existing SPA rewrite remains intact', () => {
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: '/index.html' }])
})

test('unauthenticated Admin authorization stays 401 JSON with private no-store', async () => {
  const res = response()
  await authorizationHandler({ method: 'GET', headers: {} }, res)

  assert.equal(res.statusCode, 401)
  assert.equal(res.headers['Content-Type'], 'application/json')
  assert.equal(res.headers['Cache-Control'], 'private, no-store, max-age=0')
  assert.equal(res.headers.Pragma, 'no-cache')
  assert.equal(res.headers.Vary, 'Authorization')
  assert.equal(res.payload.error.code, 'unauthenticated')
})
