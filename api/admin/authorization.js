import { AdminRequestError, adminAuthorizationError, adminAuthorizationPhase, adminError, createAdminAuthorizationDiagnostic, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensureGet, sendJson } from '../_supabase.js'

const JWT_COMPACT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

export default async function handler(req, res) {
  const diagnostic = createAdminAuthorizationDiagnostic(req)
  adminAuthorizationPhase(diagnostic, 'request_received')
  try {
    let isGet
    try { isGet = ensureGet(req, res) } catch (error) { throw adminAuthorizationError('RESPONSE_SETUP_FAILURE', error) }
    if (!isGet) return
    try { setAdminNoStore(res) } catch (error) { throw adminAuthorizationError('RESPONSE_SETUP_FAILURE', error) }
    const authorization = req.headers?.authorization
    const bearerToken = typeof authorization === 'string' ? /^Bearer\s+(\S+)$/i.exec(authorization)?.[1] : null
    adminAuthorizationPhase(diagnostic, 'bearer_shape_validated', { bearerPresent: Boolean(bearerToken), bearerCompact: Boolean(bearerToken && JWT_COMPACT_PATTERN.test(bearerToken)) })
    if (bearerToken && !JWT_COMPACT_PATTERN.test(bearerToken)) throw new AdminRequestError(401, 'invalid_session', 'The admin session is invalid or expired.')
    const admin = await requireAdmin(req, 'operator', diagnostic)
    adminAuthorizationPhase(diagnostic, 'authorization_completed')
    try { sendJson(res, 200, { version: 'v1', role: admin.role }) } catch (error) { throw adminAuthorizationError('RESPONSE_SETUP_FAILURE', error) }
  } catch (error) { adminError(res, error, diagnostic) }
}
