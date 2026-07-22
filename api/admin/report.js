import { AdminRequestError, adminError, adminRpc, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensurePost, PublicRequestError, readRequestBody, sendJson } from '../_supabase.js'
import { normalizeReportRequest, reportingRpcBody } from './_reporting.js'

export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  setAdminNoStore(res)
  try {
    let body
    try { body = readRequestBody(req) } catch (error) {
      if (error instanceof PublicRequestError) throw new AdminRequestError(error.status, 'invalid_request', error.message)
      throw error
    }
    const admin = await requireAdmin(req, 'manager')
    const request = normalizeReportRequest(body)
    const report = await adminRpc('admin_a4_report', reportingRpcBody(admin.userId, request))
    sendJson(res, 200, { ...report, period: { preset: request.preset, from: request.from, to: request.to }, filters: request.filters })
  } catch (error) { adminError(res, error) }
}
