import { sendJson } from './_supabase.js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MAX_LIMIT = 100

export class AdminRequestError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code }
}

export function adminError(res, error) {
  const known = error instanceof AdminRequestError
  sendJson(res, known ? error.status : 500, { error: { code: known ? error.code : 'internal_error', message: known ? error.message : 'Admin request failed.' } })
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

export async function adminSelect(table, select, { limit, offset, filters = {}, order = 'created_at.desc' }) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new AdminRequestError(503, 'admin_unavailable', 'Admin service is not configured.')
  const params = new URLSearchParams({ select, limit: String(limit), offset: String(offset), order })
  for (const [name, value] of Object.entries(filters)) if (value) params.set(name, `eq.${value}`)
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${table}?${params}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, Prefer: 'count=exact' } })
  if (!response.ok) throw new Error('Admin read failed.')
  const total = Number((response.headers.get('content-range') ?? '*/0').split('/')[1]) || 0
  return { items: await response.json(), page: { limit, offset, total } }
}

export async function adminRpc(functionName, body) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new AdminRequestError(503, 'admin_unavailable', 'Admin service is not configured.')
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${functionName}`, { method: 'POST', headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new AdminRequestError(response.status === 409 ? 409 : 500, payload?.message === 'idempotency_conflict' ? 'idempotency_conflict' : 'operation_failed', 'The operation could not be completed.')
  return payload
}
