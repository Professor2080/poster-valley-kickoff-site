import { createHash, timingSafeEqual } from 'node:crypto'
import { hashInvitationToken, isInvitationExpired, readInvitationToken } from '../_commerce.js'
import { isResendConfigured, sendOrderInvitationEmail } from '../_notifications.js'
import {
  ensurePost,
  PublicRequestError,
  readRequestBody,
  selectRows,
  sendJson,
  updateRows,
} from '../_supabase.js'

const allowedStatuses = new Set(['draft', 'sent'])

function requestSecret(req) {
  const value = req.headers?.['x-admin-action-secret']
  return Array.isArray(value) ? value[0] : value
}

function secretsMatch(provided, configured) {
  if (typeof provided !== 'string' || !provided || !configured) {
    return false
  }

  const providedDigest = createHash('sha256').update(provided).digest()
  const configuredDigest = createHash('sha256').update(configured).digest()
  return timingSafeEqual(providedDigest, configuredDigest)
}

async function findInvitation(token) {
  const invitations = await selectRows('order_invitations', {
    token_hash: `eq.${hashInvitationToken(token)}`,
    select: '*',
    limit: 1,
  })

  return invitations[0] ?? null
}

function safeResult(invitation, { alreadySent = false } = {}) {
  return {
    success: true,
    invitationStatus: invitation.status,
    sentAt: invitation.sent_at,
    alreadySent,
  }
}

async function claimInvitation(invitation, sentAt) {
  const updated = await updateRows(
    'order_invitations',
    {
      id: `eq.${invitation.id}`,
      status: 'in.(draft,sent)',
      sent_at: 'is.null',
    },
    {
      status: 'sent',
      sent_at: sentAt,
      updated_at: sentAt,
    },
  )

  return updated[0] ?? null
}

async function releaseClaim(invitation, sentAt) {
  await updateRows(
    'order_invitations',
    {
      id: `eq.${invitation.id}`,
      sent_at: `eq.${sentAt}`,
    },
    {
      status: invitation.status,
      sent_at: invitation.sent_at,
      updated_at: new Date().toISOString(),
    },
  )
}

export default async function handler(req, res) {
  if (!ensurePost(req, res)) {
    return
  }

  const configuredSecret = process.env.ADMIN_ACTION_SECRET

  if (!configuredSecret) {
    sendJson(res, 503, { success: false, error: 'ADMIN_ACTION_SECRET is not configured.' })
    return
  }

  if (!secretsMatch(requestSecret(req), configuredSecret)) {
    sendJson(res, 401, { success: false, error: 'Unauthorized.' })
    return
  }

  if (!isResendConfigured()) {
    sendJson(res, 503, { success: false, error: 'RESEND_API_KEY is not configured.' })
    return
  }

  try {
    const body = readRequestBody(req)
    const token = readInvitationToken(body.token)

    if (body.force !== undefined && typeof body.force !== 'boolean') {
      throw new PublicRequestError('Force must be true or false.')
    }

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

    if (!allowedStatuses.has(invitation.status)) {
      throw new PublicRequestError('This order invitation cannot be emailed in its current state.', 409)
    }

    const force = body.force === true

    if (invitation.sent_at && !force) {
      sendJson(res, 200, safeResult(invitation, { alreadySent: true }))
      return
    }

    const sentAt = new Date().toISOString()
    let claimedInvitation = invitation

    if (!force) {
      claimedInvitation = await claimInvitation(invitation, sentAt)

      if (!claimedInvitation) {
        const currentInvitation = await findInvitation(token)

        if (currentInvitation?.sent_at) {
          sendJson(res, 200, safeResult(currentInvitation, { alreadySent: true }))
          return
        }

        throw new PublicRequestError('This order invitation could not be claimed for sending.', 409)
      }
    }

    const sent = await sendOrderInvitationEmail({
      email: invitation.email,
      firstName: invitation.first_name || 'there',
      dropTitle: invitation.drop_title,
      token,
      expiresAt: invitation.expires_at,
    })

    if (!sent) {
      if (!force) {
        await releaseClaim(invitation, sentAt)
      }
      throw new PublicRequestError('The invitation email could not be sent.', 502)
    }

    if (force) {
      const updated = await updateRows(
        'order_invitations',
        { id: `eq.${invitation.id}` },
        { status: 'sent', sent_at: sentAt, updated_at: sentAt },
      )
      claimedInvitation = updated[0] ?? { ...invitation, status: 'sent', sent_at: sentAt }
    }

    sendJson(res, 200, safeResult(claimedInvitation))
  } catch (error) {
    if (error instanceof PublicRequestError) {
      sendJson(res, error.status, { success: false, error: error.message })
      return
    }

    console.error('Single order invitation email request failed.')
    sendJson(res, 500, { success: false, error: 'The invitation email could not be sent.' })
  }
}
