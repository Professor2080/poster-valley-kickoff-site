import { AdminRequestError, adminError, requireAdmin, setAdminNoStore } from '../_admin.js'
import { operationalEmailConfiguration } from '../_notifications.js'
import { ensureGet, sendJson } from '../_supabase.js'

const operations = new Set(['authorization', 'delivery'])

export default async function handler(req, res) {
  if (!ensureGet(req, res)) return
  setAdminNoStore(res)
  try {
    const operation = req.query?.operation
    if (typeof operation !== 'string' || !operations.has(operation)) {
      throw new AdminRequestError(400, 'invalid_admin_status_operation', 'Admin status operation is not supported.')
    }
    if (operation === 'authorization') {
      const admin = await requireAdmin(req)
      sendJson(res, 200, { version: 'v1', role: admin.role })
      return
    }
    await requireAdmin(req, 'manager')
    sendJson(res, 200, operationalEmailConfiguration())
  } catch (error) { adminError(res, error) }
}
