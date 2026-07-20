import { randomBytes, randomUUID } from 'node:crypto'
import { hashInvitationToken } from '../_commerce.js'
import { getOrderableDropBySlug } from '../_drops.js'
import { prepareOperationalEmail } from '../_notifications.js'
import { createRow, ensurePost, PublicRequestError, readRequestBody, readText, selectRows, sendJson, updateRows } from '../_supabase.js'
import { AdminRequestError, adminError, requireAdmin } from '../_admin.js'

const fulfilmentTransitions = { unfulfilled: ['ready_to_pack'], ready_to_pack: ['packed'], packed: ['shipped'], shipped: [] }
const actionRoles = { 'invitation.preview': 'operator', 'invitation.send': 'operator', 'quote.approve': 'manager', 'fulfilment.transition': 'operator' }
const uuid = (value, label) => {
  const text = readText(value, label, 80)
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(text)) throw new PublicRequestError(`${label} is invalid.`)
  return text
}
const idempotency = (value) => readText(value, 'Idempotency key', 100)
async function event(table, row) { await createRow(table, row) }
async function audited(admin, action, entityType, entityId, key, details = {}) {
  const correlationId = randomUUID()
  await event('admin_audit_events', { actor_user_id: admin.userId, action, entity_type: entityType, entity_id: entityId, correlation_id: correlationId, idempotency_key: key, details })
  await event('entity_events', { actor_user_id: admin.userId, source: 'admin', event_type: action, entity_type: entityType, entity_id: entityId, correlation_id: correlationId, idempotency_key: key, payload: details })
  return correlationId
}
function dollars(value) { const result = Number(value); if (!Number.isFinite(result) || result < 0 || result > 10000) throw new PublicRequestError('Shipping amount is invalid.'); return result.toFixed(2) }

export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  try {
    const body = readRequestBody(req); const action = readText(body.action, 'Action', 50)
    if (!(action in actionRoles)) throw new AdminRequestError(400, 'invalid_action', 'Unknown operational action.')
    const admin = await requireAdmin(req, actionRoles[action]); const key = idempotency(body.idempotencyKey)
    if (body.confirmation !== 'CONFIRM') throw new AdminRequestError(409, 'confirmation_required', 'Type CONFIRM before submitting this action.')
    if (action === 'invitation.preview' || action === 'invitation.send') {
      const reservationId = uuid(body.reservationId, 'Reservation id'); const rows = await selectRows('drop_interest_requests', { id: `eq.${reservationId}`, select: '*', limit: 1 }); const reservation = rows[0]
      if (!reservation) throw new AdminRequestError(404, 'not_found', 'Reservation was not found.')
      if (reservation.reservation_status === 'converted' || reservation.reservation_status === 'cancelled') throw new AdminRequestError(409, 'invalid_transition', 'This reservation cannot receive an invitation.')
      const drop = getOrderableDropBySlug(reservation.drop_slug); if (!drop) throw new AdminRequestError(409, 'unavailable_drop', 'This drop cannot receive invitations.')
      const preview = { reservationId, dropTitle: drop.title, quantity: reservation.quantity, currency: drop.currency, unitPrice: drop.basePrice, expiresAt: body.expiresAt ?? null }
      if (action === 'invitation.preview') return sendJson(res, 200, { success: true, preview })
      const existing = await selectRows('order_invitations', { interest_request_id: `eq.${reservationId}`, select: '*', limit: 1 }); const token = randomBytes(32).toString('base64url'); const now = new Date().toISOString()
      const invitation = existing[0] ? (await updateRows('order_invitations', { id: `eq.${existing[0].id}` }, { token_hash: hashInvitationToken(token), status: 'sent', sent_at: now, expires_at: preview.expiresAt, updated_at: now }))[0] : await createRow('order_invitations', { interest_request_id: reservationId, drop_id: drop.id, drop_slug: drop.slug, drop_title: drop.title, email: reservation.email, email_normalized: reservation.email_normalized || reservation.email.toLowerCase(), first_name: reservation.first_name, last_name: reservation.last_name, quantity: reservation.quantity, currency: drop.currency, unit_price: drop.basePrice, subtotal_amount: Number(drop.basePrice) * Number(reservation.quantity), token_hash: hashInvitationToken(token), status: 'sent', sent_at: now, expires_at: preview.expiresAt })
      const mail = await prepareOperationalEmail({ to: reservation.email, subject: 'Your Poster Valley order invitation', html: '', text: '' })
      await event('email_delivery_events', { entity_type: 'order_invitation', entity_id: invitation.id, template: 'order_invitation', delivery_status: mail.suppressed ? 'suppressed' : (mail.delivered ? 'sent' : 'failed'), details: { delivery_mode: mail.suppressed ? 'suppressed' : 'enabled' } })
      await updateRows('drop_interest_requests', { id: `eq.${reservationId}` }, { reservation_status: 'order_invited', status: 'payment_link_sent' })
      await audited(admin, existing[0] ? 'invitation.resent' : 'invitation.sent', 'order_invitation', invitation.id, key, { reservation_id: reservationId, delivery: mail.suppressed ? 'suppressed' : 'attempted' })
      return sendJson(res, 200, { success: true, invitationId: invitation.id, delivery: mail.suppressed ? 'suppressed' : 'sent' })
    }
    if (action === 'quote.approve') {
      const invitationId = uuid(body.invitationId, 'Invitation id'); const expiresAt = readText(body.expiresAt, 'Quote expiry', 40); if (Number.isNaN(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()) throw new AdminRequestError(400, 'invalid_expiry', 'Quote expiry must be in the future.')
      const quote = await createRow('manual_shipping_quotes', { invitation_id: invitationId, country_code: readText(body.countryCode, 'Country', 2).toUpperCase(), shipping_amount: dollars(body.shippingAmount), expires_at: expiresAt, approved_by: admin.userId })
      await audited(admin, 'quote.approved', 'manual_shipping_quote', quote.id, key, { invitation_id: invitationId, expires_at: expiresAt }); return sendJson(res, 201, { success: true, quoteId: quote.id })
    }
    const orderId = uuid(body.orderId, 'Order id'); const target = readText(body.targetStatus, 'Target status', 20); const orders = await selectRows('orders', { id: `eq.${orderId}`, select: '*', limit: 1 }); const order = orders[0]
    if (!order) throw new AdminRequestError(404, 'not_found', 'Order was not found.'); if (order.status !== 'paid') throw new AdminRequestError(409, 'payment_not_confirmed', 'Only provider-confirmed paid orders can be fulfilled.')
    const current = order.fulfilment_status || 'unfulfilled'; if (!fulfilmentTransitions[current]?.includes(target)) throw new AdminRequestError(409, 'invalid_transition', 'This fulfilment transition is not allowed.')
    const patch = { fulfilment_status: target, updated_at: new Date().toISOString() }; if (target === 'shipped') { patch.carrier = readText(body.carrier, 'Carrier', 80); patch.tracking_number = readText(body.trackingNumber, 'Tracking number', 120); patch.shipped_at = new Date().toISOString() }
    await updateRows('orders', { id: `eq.${orderId}`, fulfilment_status: `eq.${current}` }, patch); await audited(admin, `fulfilment.${target}`, 'order', orderId, key, target === 'shipped' ? { carrier: patch.carrier, tracking_recorded: true } : {})
    return sendJson(res, 200, { success: true, fulfilmentStatus: target })
  } catch (error) { adminError(res, error) }
}
