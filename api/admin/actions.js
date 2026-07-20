import { AdminRequestError, adminError, adminRpc, requireAdmin } from '../_admin.js'
import { getOrderableDropBySlug } from '../_drops.js'
import { operationalDeliveryAdapter } from '../_notifications.js'
import { PublicRequestError, ensurePost, readRequestBody, sendJson } from '../_supabase.js'
import { quoteForInvitation } from '../_commerce.js'
import {
  actionRequestHash,
  actionRoles,
  buildOperationalMessage,
  deliveryClaimId,
  deliveryIdempotencyKey,
  deriveInvitationToken,
  invitationExpiry,
  invitationTokenHash,
  normalizeActionRequest,
} from './_actions.js'

function actionName(body) {
  if (typeof body.action !== 'string' || !actionRoles[body.action]) throw new AdminRequestError(400, 'invalid_action', 'Unknown operational action.')
  return body.action
}

function idempotencyKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]{8,100}$/.test(value)) throw new AdminRequestError(400, 'invalid_idempotency_key', 'A stable retry key is required.')
  return value
}

function assertManualDestination(preview, request) {
  const quote = quoteForInvitation({
    drop_slug: preview.dropSlug,
    quantity: preview.quantity,
    unit_price: preview.unitPrice,
    currency: preview.currency,
  }, request.countryCode)
  if (quote.supported || !quote.reviewNeeded) throw new AdminRequestError(400, 'invalid_quote_destination', 'Manual quotes are only available for destinations requiring manual review.')
}

async function previewAction(admin, action, request) {
  const result = await adminRpc('admin_a3_preview_action', { p_actor: admin.userId, p_action: action, p_request: request })
  if (action.startsWith('quote.')) assertManualDestination(result.preview, request)
  if (result.preview?.actionAllowed === false) throw new AdminRequestError(409, 'stale_transition', 'The record changed. Refresh the preview before confirming.')
  return result
}

export function createAdminActionsHandler({ deliver = operationalDeliveryAdapter() } = {}) {
  return async function handler(req, res) {
    if (!ensurePost(req, res)) return
    try {
      let body
      try { body = readRequestBody(req) } catch (error) {
        if (error instanceof PublicRequestError) throw new AdminRequestError(error.status, 'invalid_request', error.message)
        throw error
      }
      const action = actionName(body)
      const request = normalizeActionRequest(action, body)
      const admin = await requireAdmin(req, actionRoles[action])

      if (action.endsWith('.preview')) {
        sendJson(res, 200, await previewAction(admin, action, request))
        return
      }

      if (body.confirmation !== 'CONFIRM') throw new AdminRequestError(409, 'confirmation_required', 'Type CONFIRM before submitting this action.')
      const key = idempotencyKey(body.idempotencyKey)
      const requestHash = actionRequestHash(action, request)
      const replay = await adminRpc('admin_a3_replay_action', {
        p_actor: admin.userId,
        p_action: action,
        p_idempotency_key: key,
        p_request_hash: requestHash,
      })
      if (replay?.found && replay.result?.deliveryStatus !== 'pending') {
        sendJson(res, 200, { ...replay.result, replay: true })
        return
      }
      let context = {}

      if (action.startsWith('invitation.')) {
        // Use the neutral preview for server-owned product context so a completed
        // same-key retry can still reach the idempotent RPC replay path.
        const preview = (await previewAction(admin, 'invitation.preview', request)).preview
        const drop = getOrderableDropBySlug(preview.dropSlug)
        if (!drop) throw new AdminRequestError(409, 'invalid_transition', 'This reservation is not available for invitation.')
        const token = deriveInvitationToken({ actorUserId: admin.userId, action, idempotencyKey: key, reservationId: request.reservationId })
        context = { dropId: drop.id, dropTitle: drop.title, unitPrice: drop.basePrice, currency: drop.currency, tokenHash: invitationTokenHash(token), expiresAt: invitationExpiry() }
      } else if (action === 'quote.approve') {
        await previewAction(admin, 'quote.preview', request)
      }

      let result = await adminRpc('admin_a3_apply_action', {
        p_actor: admin.userId,
        p_action: action,
        p_idempotency_key: key,
        p_request_hash: requestHash,
        p_request: request,
        p_context: context,
      })

      if (result.emailAttemptId && result.deliveryStatus === 'pending') {
        const claimId = deliveryClaimId()
        const claim = await adminRpc('admin_a3_claim_delivery', { p_actor: admin.userId, p_attempt_id: result.emailAttemptId, p_claim_id: claimId })
        if (!claim.claimed) {
          const completed = await adminRpc('admin_a3_replay_action', { p_actor: admin.userId, p_action: action, p_idempotency_key: key, p_request_hash: requestHash })
          sendJson(res, 200, { ...completed.result, replay: true })
          return
        }
        const payload = await adminRpc('admin_a3_delivery_payload', { p_actor: admin.userId, p_attempt_id: result.emailAttemptId, p_claim_id: claimId })
        let token = null
        let delivery
        if (payload.template === 'order_invitation') {
          token = deriveInvitationToken({ actorUserId: payload.tokenActorUserId, action: payload.tokenAction, idempotencyKey: payload.tokenIdempotencyKey, reservationId: payload.reservationId })
          delivery = invitationTokenHash(token) === payload.tokenHash && new Date(payload.expiresAt).valueOf() > Date.now()
            ? null
            : { status: 'failed', providerId: null }
        }
        if (!delivery) {
          const message = buildOperationalMessage(payload, token)
          delivery = await deliver({ ...message, idempotencyKey: deliveryIdempotencyKey(result.emailAttemptId) })
        }
        result = await adminRpc('admin_a3_complete_delivery', {
          p_actor: admin.userId,
          p_action: action,
          p_idempotency_key: key,
          p_request_hash: requestHash,
          p_attempt_id: result.emailAttemptId,
          p_claim_id: claimId,
          p_delivery_status: delivery.status,
          p_provider_id: delivery.providerId,
        })
      }

      sendJson(res, 200, result)
    } catch (error) {
      adminError(res, error)
    }
  }
}

export default createAdminActionsHandler()
