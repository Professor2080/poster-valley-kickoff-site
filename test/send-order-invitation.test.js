import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { after, before, test } from 'node:test'

const originalFetch = globalThis.fetch
const originalAdminSecret = process.env.ADMIN_ACTION_SECRET
const originalResendKey = process.env.RESEND_API_KEY
const originalSupabaseUrl = process.env.SUPABASE_URL
const originalSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const adminSecret = 'test-admin-secret'
const rawToken = 'pv_test_abcdefghijklmnopqrstuvwxyz'
const tokenHash = createHash('sha256').update(rawToken).digest('hex')
let invitation
let resendRequests

process.env.ADMIN_ACTION_SECRET = adminSecret
process.env.RESEND_API_KEY = 're_test_key'
process.env.SUPABASE_URL = 'https://supabase.test'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'supabase-test-key'

function resetState() {
  invitation = {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'draft',
    sent_at: null,
    expires_at: '2099-01-01T00:00:00.000Z',
    email: 'delivered@resend.dev',
    first_name: 'Internal',
    drop_title: 'Eurofighter Typhoon',
  }
  resendRequests = 0
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    payload: null,
    status(code) {
      this.statusCode = code
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(body) {
      this.payload = JSON.parse(body)
    },
  }
}

function request(body, secret = adminSecret) {
  return {
    method: 'POST',
    headers: secret === null ? {} : { 'x-admin-action-secret': secret },
    body,
  }
}

before(async () => {
  resetState()

  globalThis.fetch = async (url, options = {}) => {
    const parsedUrl = new URL(url)

    if (parsedUrl.hostname === 'api.resend.com') {
      resendRequests += 1
      return new Response('{}', { status: 200 })
    }

    if (parsedUrl.hostname !== 'supabase.test') {
      throw new Error('Unexpected network request in test.')
    }

    if (options.method === 'GET') {
      const matchesToken = parsedUrl.searchParams.get('token_hash') === `eq.${tokenHash}`
      return new Response(JSON.stringify(matchesToken ? [invitation] : []), { status: 200 })
    }

    if (options.method === 'PATCH') {
      if (parsedUrl.searchParams.get('sent_at') === 'is.null' && invitation.sent_at) {
        return new Response('[]', { status: 200 })
      }

      invitation = { ...invitation, ...JSON.parse(options.body) }
      return new Response(JSON.stringify([invitation]), { status: 200 })
    }

    throw new Error('Unexpected Supabase operation in test.')
  }
})

after(() => {
  globalThis.fetch = originalFetch

  const restore = (name, value) => {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }

  restore('ADMIN_ACTION_SECRET', originalAdminSecret)
  restore('RESEND_API_KEY', originalResendKey)
  restore('SUPABASE_URL', originalSupabaseUrl)
  restore('SUPABASE_SERVICE_ROLE_KEY', originalSupabaseKey)
})

const { default: handler } = await import('../api/admin/send-order-invitation.js')

test('rejects a missing or incorrect admin secret', async () => {
  for (const secret of [null, 'incorrect-secret']) {
    const res = response()
    await handler(request({ token: rawToken }, secret), res)
    assert.equal(res.statusCode, 401)
    assert.deepEqual(res.payload, { success: false, error: 'Unauthorized.' })
  }
  assert.equal(resendRequests, 0)
})

test('rejects a missing or invalid invitation token', async () => {
  const missingResponse = response()
  await handler(request({}), missingResponse)
  assert.equal(missingResponse.statusCode, 400)

  const invalidResponse = response()
  await handler(request({ token: 'pv_unknown_abcdefghijklmnopqrstuvwxyz' }), invalidResponse)
  assert.equal(invalidResponse.statusCode, 404)
  assert.equal(resendRequests, 0)
})

test('sends one draft invitation and does not duplicate it on retry', async () => {
  resetState()

  const firstResponse = response()
  await handler(request({ token: rawToken }), firstResponse)

  assert.equal(firstResponse.statusCode, 200)
  assert.equal(firstResponse.payload.success, true)
  assert.equal(firstResponse.payload.invitationStatus, 'sent')
  assert.equal(firstResponse.payload.alreadySent, false)
  assert.ok(firstResponse.payload.sentAt)
  assert.equal(resendRequests, 1)

  const retryResponse = response()
  await handler(request({ token: rawToken }), retryResponse)

  assert.equal(retryResponse.statusCode, 200)
  assert.equal(retryResponse.payload.success, true)
  assert.equal(retryResponse.payload.alreadySent, true)
  assert.equal(resendRequests, 1)
})
