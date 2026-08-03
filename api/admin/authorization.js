import { AdminRequestError, adminError, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensureGet, sendJson } from '../_supabase.js'

const JWT_COMPACT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export default async function handler(req, res) {
  if (!ensureGet(req, res)) return
  setAdminNoStore(res)
  try {
    const authorization = req.headers?.authorization
    const bearerToken = typeof authorization === 'string' ? /^Bearer\s+(\S+)$/i.exec(authorization)?.[1] : null
    if (bearerToken && !JWT_COMPACT_PATTERN.test(bearerToken)) throw new AdminRequestError(401, 'invalid_session', 'The admin session is invalid or expired.')
    const admin = await requireAdmin(req)
    sendJson(res, 200, { version: 'v1', role: admin.role })
  } catch (error) { adminError(res, error) }
}
