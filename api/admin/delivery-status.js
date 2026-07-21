import { adminError, requireAdmin, setAdminNoStore } from '../_admin.js'
import { operationalEmailConfiguration } from '../_notifications.js'
import { sendJson } from '../_supabase.js'

export default async function handler(req, res) {
  setAdminNoStore(res)
  try {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); sendJson(res, 405, { error: { code: 'method_not_allowed', message: 'Method not allowed.' } }); return }
    await requireAdmin(req, 'manager')
    sendJson(res, 200, operationalEmailConfiguration())
  } catch (error) { adminError(res, error) }
}
