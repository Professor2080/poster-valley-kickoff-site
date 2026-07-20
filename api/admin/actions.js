import { createHash } from 'node:crypto'
import { adminError, adminRpc, AdminRequestError, requireAdmin } from '../_admin.js'
import { ensurePost, readRequestBody, readText, sendJson } from '../_supabase.js'

const roles = { 'invitation.preview': 'operator', 'invitation.prepare': 'operator', 'quote.approve': 'manager', 'fulfilment.transition': 'operator' }
function canonical(value) { return JSON.stringify(value, Object.keys(value).sort()) }
export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  try {
    const body = readRequestBody(req); const action = readText(body.action, 'Action', 40)
    if (!roles[action]) throw new AdminRequestError(400, 'invalid_action', 'Unknown operational action.')
    const admin = await requireAdmin(req, roles[action])
    // Preview is explicitly read-only and does not need confirmation or a key.
    if (action === 'invitation.preview') return sendJson(res, 200, await adminRpc('admin_a3_preview_invitation', { p_reservation_id: readText(body.reservationId, 'Reservation id', 80) }))
    if (body.confirmation !== 'CONFIRM') throw new AdminRequestError(409, 'confirmation_required', 'Type CONFIRM before submitting this action.')
    const key = readText(body.idempotencyKey, 'Idempotency key', 100)
    const request = { ...body }; delete request.idempotencyKey; delete request.confirmation
    const requestHash = createHash('sha256').update(canonical(request)).digest('hex')
    const result = await adminRpc('admin_a3_apply_action', { p_actor: admin.userId, p_action: action, p_idempotency_key: key, p_request_hash: requestHash, p_request: request })
    sendJson(res, 200, result)
  } catch (error) { adminError(res, error) }
}
