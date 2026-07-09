import {
  canUseInvitation,
  hashInvitationToken,
  isInvitationExpired,
  quoteForInvitation,
  readInvitationToken,
} from './_commerce.js'
import {
  ensurePost,
  handleEndpointError,
  PublicRequestError,
  readRequestBody,
  selectRows,
  sendJson,
  updateRows,
} from './_supabase.js'

async function findInvitation(token) {
  const invitations = await selectRows('order_invitations', {
    token_hash: `eq.${hashInvitationToken(token)}`,
    select: '*',
    limit: 1,
  })

  return invitations[0] ?? null
}

export default async function handler(req, res) {
  if (!ensurePost(req, res)) {
    return
  }

  try {
    const body = readRequestBody(req)
    const token = readInvitationToken(body.token)
    const invitation = await findInvitation(token)

    if (!invitation) {
      throw new PublicRequestError('This order invitation link is not valid.', 404)
    }

    if (isInvitationExpired(invitation)) {
      await updateRows(
        'order_invitations',
        { id: `eq.${invitation.id}` },
        { status: 'expired', updated_at: new Date().toISOString() },
      )
      throw new PublicRequestError('This order invitation has expired.', 410)
    }

    if (!canUseInvitation(invitation)) {
      throw new PublicRequestError('This order invitation can no longer be used.', 409)
    }

    const quote = quoteForInvitation(invitation, body.countryCode)
    sendJson(res, 200, { ok: true, quote })
  } catch (error) {
    handleEndpointError(res, error)
  }
}
