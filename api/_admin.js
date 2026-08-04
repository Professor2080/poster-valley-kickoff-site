import { randomUUID } from 'node:crypto'

import { sendJson } from './_supabase.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAX_LIMIT = 100
const ADMIN_AUTH_DIAGNOSTIC_PREFIX = 'admin_authorization_diagnostic'

class AdminDiagnosticError extends Error {
  constructor(category, cause, upstreamStatus = null) {
    super('Admin authorization diagnostic failure.', { cause })
    this.name = 'AdminDiagnosticError'
    this.category = category
    this.originalError = cause
    this.upstreamStatus = upstreamStatus
  }
}

function normalizedVercelRequestId(req) {
  let value = null
  try { value = req.headers?.['x-vercel-id'] } catch { value = null }
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ? value : null
}

export function createAdminAuthorizationDiagnostic(req) {
  return { invocationId: normalizedVercelRequestId(req) ?? randomUUID(), lastPhase: null, failureLogged: false }
}

function diagnosticLog(level, diagnostic, phase, fields = {}) {
  if (!diagnostic) return
  diagnostic.lastPhase = phase
  console[level](`${ADMIN_AUTH_DIAGNOSTIC_PREFIX} ${JSON.stringify({ invocationId: diagnostic.invocationId, phase, ...fields })}`)
}

export function adminAuthorizationPhase(diagnostic, phase, fields = {}) {
  diagnosticLog('log', diagnostic, phase, fields)
}

export function adminAuthorizationError(category, error) {
  return new AdminDiagnosticError(category, error)
}

function safeExceptionName(error) {
  const original = error instanceof AdminDiagnosticError ? error.originalError : error
  const name = original instanceof Error ? original.name : null
  return typeof name === 'string' && /^[A-Za-z][A-Za-z0-9]{0,63}$/.test(name) ? name : null
}

function safeStackLocation(error) {
  const candidates = [error, error instanceof AdminDiagnosticError ? error.originalError : null]
  for (const candidate of candidates) {
    if (!(candidate instanceof Error) || typeof candidate.stack !== 'string') continue
    for (const line of candidate.stack.split(/\r?\n/).slice(1)) {
      const match = /[\\/](api[\\/](?:_admin|admin[\\/]authorization)\.js)(?:\?[^:()\s]*)?:(\d+):(\d+)(?:\)?$|\s)/.exec(line)
      if (match) return `${match[1].replaceAll('\\', '/')}:${match[2]}:${match[3]}`
    }
  }
  return null
}

function diagnosticFailure(diagnostic, error) {
  if (!diagnostic || diagnostic.failureLogged) return
  diagnostic.failureLogged = true
  const category = error instanceof AdminDiagnosticError ? error.category : 'UNEXPECTED_RUNTIME_FAILURE'
  const upstreamStatus = error instanceof AdminDiagnosticError && Number.isInteger(error.upstreamStatus) ? error.upstreamStatus : null
  diagnosticLog('error', diagnostic, 'failed', {
    lastPhase: diagnostic.lastPhase,
    category,
    exceptionName: safeExceptionName(error),
    stackLocation: safeStackLocation(error),
    upstreamStatus,
  })
}

function isAsciiOnly(value) {
  return typeof value === 'string' && Array.from(value).every((character) => character.codePointAt(0) <= 0x7F)
}

function urlCharacteristics(value) {
  const present = typeof value === 'string' && value.length > 0
  const leadingOrTrailingWhitespace = typeof value === 'string' && value.trim() !== value
  const hasBom = typeof value === 'string' && value.includes('\uFEFF')
  const asciiOnly = isAsciiOnly(value)
  let parsed = null
  try { parsed = present ? new URL(value) : null } catch { parsed = null }
  return {
    present,
    parseable: parsed !== null,
    protocolHttps: parsed?.protocol === 'https:',
    hostnameHasExpectedSupabaseFormat: parsed ? /^[a-z0-9]{20}\.supabase\.co$/i.test(parsed.hostname) : false,
    leadingOrTrailingWhitespace,
    hasBom,
    asciiOnly,
  }
}

function serviceKeyCharacteristics(value, token) {
  const present = typeof value === 'string' && value.length > 0
  const leadingOrTrailingWhitespace = typeof value === 'string' && value.trim() !== value
  const hasBom = typeof value === 'string' && value.includes('\uFEFF')
  const hasCrLf = typeof value === 'string' && /[\r\n]/.test(value)
  const asciiOnly = isAsciiOnly(value)
  let headerConstructible = false
  let constructionError = null
  if (present) {
    try {
      new Headers({ apikey: value, Authorization: `Bearer ${token}` })
      headerConstructible = true
    } catch (error) {
      constructionError = error
    }
  }
  return {
    details: {
      present,
      characterLength: typeof value === 'string' ? value.length : 0,
      asciiOnly,
      hasBom,
      leadingOrTrailingWhitespace,
      hasCrLf,
      headerConstructible,
    },
    constructionError,
  }
}

function prepareAdminAuthorizationConfig(token, diagnostic) {
  diagnosticLog('log', diagnostic, 'config_present', { supabaseUrlPresent: Boolean(SUPABASE_URL), serviceRoleKeyPresent: Boolean(SERVICE_KEY) })
  if (!SUPABASE_URL || !SERVICE_KEY) throw new AdminRequestError(503, 'admin_unavailable', 'Admin service is not configured.')

  const urlDetails = urlCharacteristics(SUPABASE_URL)
  diagnosticLog('log', diagnostic, 'url_validated', urlDetails)
  if (!urlDetails.parseable || !urlDetails.protocolHttps || urlDetails.leadingOrTrailingWhitespace || urlDetails.hasBom || !urlDetails.asciiOnly) {
    throw new AdminDiagnosticError('INVALID_SUPABASE_URL', new TypeError('Invalid server URL configuration.'))
  }

  const key = serviceKeyCharacteristics(SERVICE_KEY, token)
  diagnosticLog('log', diagnostic, 'headers_validated', key.details)
  if (!key.details.headerConstructible) throw new AdminDiagnosticError('INVALID_SERVICE_ROLE_HEADER', key.constructionError ?? new TypeError('Invalid server header configuration.'))

  return { baseUrl: SUPABASE_URL.replace(/\/$/, ''), serviceKey: SERVICE_KEY }
}

export class AdminRequestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

export function adminError(res, error, diagnostic = null) {
  const known = error instanceof AdminRequestError
  if (!known) diagnosticFailure(diagnostic, error)
  try {
    setAdminNoStore(res)
    sendJson(res, known ? error.status : 500, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Admin request failed.' } })
  } catch (responseError) {
    diagnosticFailure(diagnostic, new AdminDiagnosticError('RESPONSE_SETUP_FAILURE', responseError))
    throw responseError
  }
}

export function setAdminNoStore(res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('Vary', 'Authorization')
}

function bearer(req) {
  const value = req.headers?.authorization
  return typeof value === 'string' && /^Bearer\s+\S+$/i.test(value) ? value.slice(7) : null
}

async function request(config, path, token, diagnostic, target) {
  let requestUrl
  try {
    requestUrl = `${config.baseUrl}${path}`
    new URL(requestUrl)
  } catch (error) {
    throw new AdminDiagnosticError('INVALID_SUPABASE_URL', error)
  }

  const headers = { apikey: config.serviceKey, Authorization: `Bearer ${token}` }
  try {
    new Headers(headers)
  } catch (error) {
    throw new AdminDiagnosticError('INVALID_SERVICE_ROLE_HEADER', error)
  }

  diagnosticLog('log', diagnostic, `${target}_fetch_started`)
  let response
  try {
    response = await fetch(requestUrl, { headers })
  } catch (error) {
    throw new AdminDiagnosticError(target === 'user' ? 'USER_FETCH_TRANSPORT_FAILURE' : 'ROLE_FETCH_TRANSPORT_FAILURE', error)
  }
  diagnosticLog('log', diagnostic, `${target}_fetch_response`, { upstreamStatus: Number.isInteger(response.status) ? response.status : null })
  if (!response.ok) return null
  try {
    const payload = await response.json()
    diagnosticLog('log', diagnostic, `${target}_json_parsed`)
    return payload
  } catch (error) {
    throw new AdminDiagnosticError(target === 'user' ? 'USER_RESPONSE_PARSE_FAILURE' : 'ROLE_RESPONSE_PARSE_FAILURE', error, response.status)
  }
}

export async function requireAdmin(req, requiredRole = 'operator', diagnostic = null) {
  const token = bearer(req)
  if (!token) throw new AdminRequestError(401, 'unauthenticated', 'A valid admin session is required.')
  const config = prepareAdminAuthorizationConfig(token, diagnostic)
  const user = await request(config, '/auth/v1/user', token, diagnostic, 'user')
  if (!user?.id) throw new AdminRequestError(401, 'invalid_session', 'The admin session is invalid or expired.')
  const roles = await request(config, `/rest/v1/admin_roles?user_id=eq.${encodeURIComponent(user.id)}&revoked_at=is.null&select=role&limit=1`, config.serviceKey, diagnostic, 'role')
  const role = roles?.[0]?.role
  if (!role) throw new AdminRequestError(403, 'not_admin', 'This account is not an active admin.')
  if (requiredRole === 'manager' && role !== 'manager') throw new AdminRequestError(403, 'insufficient_role', 'Manager role is required.')
  return { userId: user.id, role }
}

export function adminPage(query = {}) {
  const limit = Number(query.limit ?? 25)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) throw new AdminRequestError(400, 'invalid_pagination', `limit must be an integer from 1 to ${MAX_LIMIT}.`)
  const offset = Number(query.offset ?? 0)
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new AdminRequestError(400, 'invalid_pagination', 'offset must be a non-negative bounded integer.')
  return { limit, offset }
}

export async function adminSelect(table, select, { limit, offset, filters = {}, filterOperators = {}, order = 'created_at.desc' }) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new AdminRequestError(503, 'admin_unavailable', 'Admin service is not configured.')
  const params = new URLSearchParams({ select, limit: String(limit), offset: String(offset), order })
  for (const [name, value] of Object.entries(filters)) {
    if (!value) continue
    const operator = filterOperators[name] ?? 'eq'
    if (!['eq', 'neq', 'in', 'not.in'].includes(operator)) throw new AdminRequestError(400, 'invalid_filter', 'Unknown filter operator.')
    params.set(name, ['in', 'not.in'].includes(operator) ? `${operator}.(${value})` : `${operator}.${value}`)
  }
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?${params}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'count=exact' } })
  if (!response.ok) throw new Error('Admin read failed.')
  const total = Number((response.headers.get('content-range') ?? '*/0').split('/')[1]) || 0
  return { items: await response.json(), page: { limit, offset, total } }
}

export async function adminRpc(functionName, body) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new AdminRequestError(503, 'admin_unavailable', 'Admin service is not configured.')
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const databaseCode = typeof payload?.message === 'string' ? payload.message : ''
    const known = {
      forbidden: [403, 'forbidden', 'You do not have permission to perform this action.'],
      insufficient_role: [403, 'insufficient_role', 'Manager role is required.'],
      not_found: [404, 'not_found', 'The requested record was not found.'],
      idempotency_conflict: [409, 'idempotency_conflict', 'This retry key was already used for different details.'],
      operation_in_progress: [409, 'operation_in_progress', 'This operation is already in progress. Retry with the same details.'],
      reconciliation_required: [409, 'reconciliation_required', 'The provider outcome is uncertain. Verify it outside this application before choosing a reconciliation outcome.'],
      stale_transition: [409, 'stale_transition', 'The record changed after preview. Reload it before trying again.'],
      invalid_transition: [409, 'invalid_transition', 'This action is no longer available for the current lifecycle state.'],
      payment_not_confirmed: [409, 'payment_not_confirmed', 'A provider-confirmed paid payment is required.'],
      quote_in_use: [409, 'quote_in_use', 'The active quote is already attached to an order and cannot be replaced.'],
      tracking_required: [400, 'tracking_required', 'Carrier and tracking number are required before shipping.'],
      invalid_shipping_details: [409, 'invalid_shipping_details', 'Stored carrier or tracking details are not safe to email. Correct them through an approved workflow before retrying.'],
      invalid_reconciliation_evidence: [400, 'invalid_reconciliation_evidence', 'Provide a concise non-sensitive evidence note without contact data, addresses, provider IDs, secrets, tokens or links.'],
      invalid_expiry: [400, 'invalid_expiry', 'The expiry must be a valid future date.'],
      invalid_quote_destination: [400, 'invalid_quote_destination', 'Manual quotes are only available for destinations requiring manual review.'],
      invalid_manual_quote: [409, 'invalid_manual_quote', 'The manual quote changed or expired before checkout.'],
      invalid_action: [400, 'invalid_action', 'Unknown operational action.'],
      delivery_attempt_mismatch: [409, 'delivery_attempt_mismatch', 'The delivery attempt no longer matches this action.'],
      invalid_invitation_context: [400, 'invalid_invitation_context', 'The invitation delivery details are invalid.'],
      shipping_address_incomplete: [409, 'shipping_address_incomplete', 'A complete validated shipping address is required before shipping.'],
      paid_address_immutable: [409, 'paid_address_immutable', 'A provider-confirmed paid order address is read-only.'],
      origin_reason_required: [400, 'origin_reason_required', 'A concise reason is required to change record origin.'],
      confirmation_required: [409, 'confirmation_required', 'Explicit confirmation is required.'],
      ambiguous_invitations: [409, 'ambiguous_invitations', 'Multiple invitations are linked to this reservation. Resolve the records before sending.'],
      recipient_mismatch: [409, 'recipient_mismatch', 'The invitation recipient no longer matches the reservation. Resolve it before sending.'],
      invalid_provider_id: [502, 'delivery_failed', 'The email provider response could not be verified.'],
      delivery_not_confirmed: [409, 'delivery_not_confirmed', 'Delivery must be explicitly confirmed before this item can be closed.'],
      invalid_filter: [400, 'invalid_filter', 'One or more board filters are invalid.'],
      invalid_pagination: [400, 'invalid_pagination', 'Board pagination is invalid.'],
    }[databaseCode]
    if (known) throw new AdminRequestError(...known)
    throw new AdminRequestError(response.status === 409 ? 409 : 500, 'operation_failed', 'The operation could not be completed.')
  }
  return payload
}
