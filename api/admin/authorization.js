import { adminError, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensureGet, sendJson } from '../_supabase.js'
export default async function handler(req, res) {
  if (!ensureGet(req, res)) return
  setAdminNoStore(res)
  try { const admin = await requireAdmin(req); sendJson(res, 200, { version: 'v1', role: admin.role }) } catch (error) { adminError(res, error) }
}
