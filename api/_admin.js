import { sendJson } from './_supabase.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAX_LIMIT = 100

export class AdminRequestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

export function adminError(res, error) {
  const known = error instanceof AdminRequestError
  setAdminNoStore(res)
  sendJson(res, known ? error.status : 500, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Admin request failed.' } })
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

async function request(path, token) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new AdminRequestError(503, 'admin_unavailable', 'Admin service is not configured.')
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } })
  if (!response.ok) return null
  return response.json()
}

export async function requireAdmin(req, requiredRole = 'operator') {
  const token = bearer(req)
  if (!token) throw new AdminRequestError(401, 'unauthenticated', 'A valid admin session is required.')
  const user = await request('/auth/v1/user', token)
  if (!user?.id) throw new AdminRequestError(401, 'invalid_session', 'The admin session is invalid or expired.')
  const roles = await request(`/rest/v1/admin_roles?user_id=eq.${encodeURIComponent(user.id)}&revoked_at=is.null&select=role&limit=1`, SERVICE_KEY)
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
      stale_transition: [409, 'stale_transition', 'The record changed after preview. Reload it before trying again.'],
      invalid_transition: [409, 'invalid_transition', 'This action is no longer available for the current lifecycle state.'],
      payment_not_confirmed: [409, 'payment_not_confirmed', 'A provider-confirmed paid payment is required.'],
      quote_in_use: [409, 'quote_in_use', 'The active quote is already attached to an order and cannot be replaced.'],
      tracking_required: [400, 'tracking_required', 'Carrier and tracking number are required before shipping.'],
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
    }[databaseCode]
    if (known) throw new AdminRequestError(...known)
    throw new AdminRequestError(response.status === 409 ? 409 : 500, 'operation_failed', 'The operation could not be completed.')
  }
  return payload
}
