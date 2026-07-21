import {
  canUseInvitation,
  hashInvitationToken,
  isInvitationExpired,
  publicOrderSummary,
  quoteFromOrder,
  readInvitationToken,
} from './_commerce.js'
import {
  ensurePost,
  handleEndpointError,
  readRequestBody,
  selectRows,
  sendJson,
  updateRows,
} from './_supabase.js'

async function findInvitation(token) {
  const tokenHash = hashInvitationToken(token)
  const invitations = await selectRows('order_invitations', {
    token_hash: `eq.${tokenHash}`,
    select: '*',
    limit: 1,
  })

  return invitations[0] ?? null
}

async function latestOrderAndPayment(invitationId) {
  const orders = await selectRows('orders', {
    invitation_id: `eq.${invitationId}`,
    select: '*',
    order: 'created_at.desc',
    limit: 1,
  })
  const order = orders[0] ?? null

  if (!order) {
    return { order: null, payment: null }
  }

  const payments = await selectRows('payments', {
    order_id: `eq.${order.id}`,
    select: '*',
    order: 'created_at.desc',
    limit: 1,
  })

  return { order, payment: payments[0] ?? null }
}

export default async function handler(req, res) {
  if (!ensurePost(req, res)) {
    return
  }

  try {
    const token = readInvitationToken(readRequestBody(req).token)
    const invitation = await findInvitation(token)

    if (!invitation) {
      sendJson(res, 404, { error: 'This order invitation link is not valid.' })
      return
    }

    let currentInvitation = invitation

    if (isInvitationExpired(invitation) && invitation.status !== 'expired') {
      const updated = await updateRows(
        'order_invitations',
        { id: `eq.${invitation.id}` },
        { status: 'expired', updated_at: new Date().toISOString() },
      )
      currentInvitation = updated[0] ?? { ...invitation, status: 'expired' }
    } else if (
      canUseInvitation(invitation) &&
      ['draft', 'sent'].includes(invitation.status) &&
      !invitation.opened_at
    ) {
      const updated = await updateRows(
        'order_invitations',
        { id: `eq.${invitation.id}` },
        {
          status: 'opened',
          opened_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      )
      currentInvitation = updated[0] ?? { ...invitation, status: 'opened' }
    }

    const { order, payment } = await latestOrderAndPayment(currentInvitation.id)
    const quote = quoteFromOrder(order)

    res.setHeader('Cache-Control', 'private, no-store, max-age=0')
    res.setHeader('Pragma', 'no-cache')
    sendJson(res, 200, {
      ok: true,
      invitation: publicOrderSummary(currentInvitation, quote, order, payment),
    })
  } catch (error) {
    handleEndpointError(res, error)
  }
}
