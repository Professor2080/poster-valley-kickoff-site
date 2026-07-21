import { AdminRequestError, adminError, adminRpc, requireAdmin, setAdminNoStore } from '../_admin.js'
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
  confirmationSummary,
  issueConfirmationProof,
  mutationForPreview,
  normalizeActionRequest,
  previewFingerprint,
  verifyConfirmationProof,
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
  if (action === 'origin.preview') {
    return adminRpc('admin_a31_preview_origin_change', {
      p_actor: admin.userId,
      p_reservation_id: request.reservationId,
      p_new_origin: request.recordOrigin,
      p_expected_version: request.expectedOriginVersion,
      p_reason: request.reason,
    })
  }
  if ((action === 'fulfilment.preview' && request.targetStatus === 'shipped') || action === 'shipping.preview') {
    await adminRpc('admin_a31_assert_shipping_ready', { p_actor: admin.userId, p_order_id: request.orderId })
  }
  const result = await adminRpc('admin_a32_preview_action', { p_actor: admin.userId, p_action: action, p_request: request })
  if (action.startsWith('quote.')) assertManualDestination(result.preview, request)
  if (result.preview?.actionAllowed === false) throw new AdminRequestError(409, 'stale_transition', 'The record changed. Refresh the preview before confirming.')
  return result
}

const previewForMutation = {
  'invitation.send': 'invitation.preview', 'invitation.resend': 'invitation.preview', 'quote.approve': 'quote.preview',
  'fulfilment.transition': 'fulfilment.preview', 'shipping.retry': 'shipping.preview', 'origin.change': 'origin.preview',
}

export function createAdminActionsHandler({ deliver = operationalDeliveryAdapter() } = {}) {
  return async function handler(req, res) {
    if (!ensurePost(req, res)) return
    setAdminNoStore(res)
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
        const result = await previewAction(admin, action, request)
        const mutation = mutationForPreview(action) === 'invitation.send' ? result.preview?.suggestedAction : mutationForPreview(action)
        if (!mutation || !actionRoles[mutation]) throw new AdminRequestError(409, 'invalid_transition', 'No action is currently available for this record.')
        const requestHash = actionRequestHash(mutation, request)
        const previewHash = previewFingerprint(result.preview)
        const issued = issueConfirmationProof({ actorUserId: admin.userId, action: mutation, requestHash, previewHash })
        sendJson(res, 200, { ...result, confirmation: { ...issued, action: mutation, summary: confirmationSummary(mutation, result.preview) } })
        return
      }

      const key = idempotencyKey(body.idempotencyKey)
      const requestHash = actionRequestHash(action, request)
      const proof = verifyConfirmationProof(body.confirmationProof, { actorUserId: admin.userId, action, requestHash, allowExpired: true })
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
      if (proof.exp < Date.now()) throw new AdminRequestError(409, 'confirmation_expired', 'The confirmation expired. Preview the action again.')
      const currentPreview = await previewAction(admin, previewForMutation[action], request)
      if (previewFingerprint(currentPreview.preview) !== proof.previewHash) throw new AdminRequestError(409, 'confirmation_stale', 'The record changed after preview. Review it again before confirming.')
      let context = {}

      if (action === 'origin.change') {
        const result = await adminRpc('admin_a32_change_origin', {
          p_actor: admin.userId,
          p_idempotency_key: key,
          p_request_hash: requestHash,
          p_reservation_id: request.reservationId,
          p_new_origin: request.recordOrigin,
          p_expected_version: request.expectedOriginVersion,
          p_reason: request.reason,
          p_confirmation_hash: requestHash,
        })
        sendJson(res, 200, result)
        return
      }

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

      let result = await adminRpc('admin_a32_apply_action', {
        p_actor: admin.userId,
        p_action: action,
        p_idempotency_key: key,
        p_request_hash: requestHash,
        p_request: request,
        p_context: context,
        p_confirmation_hash: requestHash,
      })

      if (result.emailAttemptId && result.deliveryStatus === 'pending') {
        const claimId = deliveryClaimId()
        const claim = await adminRpc('admin_a32_claim_delivery', { p_actor: admin.userId, p_attempt_id: result.emailAttemptId, p_claim_id: claimId })
        if (!claim.claimed) {
          const completed = await adminRpc('admin_a3_replay_action', { p_actor: admin.userId, p_action: action, p_idempotency_key: key, p_request_hash: requestHash })
          sendJson(res, 200, { ...completed.result, replay: true })
          return
        }
        const payload = await adminRpc('admin_a32_delivery_payload', { p_actor: admin.userId, p_attempt_id: result.emailAttemptId, p_claim_id: claimId })
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
        if (delivery.status === 'pending') {
          sendJson(res, 202, { ...result, deliveryStatus: 'pending', reconciliationRequired: true })
          return
        }
        result = await adminRpc('admin_a32_complete_delivery', {
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
