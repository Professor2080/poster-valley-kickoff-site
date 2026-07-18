import { getMolliePayment, mapMollieStatus } from '../_mollie.js'
import { selectRows, sendJson, updateRows } from '../_supabase.js'
import {
  sendInternalPaidNotification,
  sendOrderConfirmationEmail,
} from '../_notifications.js'

function parseWebhookBody(body) {
  if (!body) {
    return {}
  }

  if (typeof body === 'string') {
    const params = new URLSearchParams(body)
    return Object.fromEntries(params.entries())
  }

  if (typeof body === 'object') {
    return body
  }

  return {}
}

function orderStatusForPayment(status) {
  if (status === 'paid') {
    return 'paid'
  }

  if (status === 'failed') {
    return 'payment_failed'
  }

  if (status === 'expired') {
    return 'payment_expired'
  }

  if (status === 'canceled') {
    return 'cancelled'
  }

  if (status === 'open') {
    return 'payment_open'
  }

  return 'awaiting_payment'
}

function invitationStatusForPayment(status) {
  if (status === 'paid') {
    return 'paid'
  }

  if (status === 'failed' || status === 'expired' || status === 'canceled') {
    return 'order_started'
  }

  return 'payment_open'
}

async function findPayment(providerPaymentId) {
  const payments = await selectRows('payments', {
    provider_payment_id: `eq.${providerPaymentId}`,
    select: '*',
    limit: 1,
  })

  return payments[0] ?? null
}

async function findOrder(orderId) {
  const orders = await selectRows('orders', {
    id: `eq.${orderId}`,
    select: '*',
    limit: 1,
  })

  return orders[0] ?? null
}

async function findInvitation(invitationId) {
  const invitations = await selectRows('order_invitations', {
    id: `eq.${invitationId}`,
    select: '*',
    limit: 1,
  })

  return invitations[0] ?? null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed.' })
    return
  }

  try {
    const body = parseWebhookBody(req.body)
    const providerPaymentId = body.id

    if (typeof providerPaymentId !== 'string' || !providerPaymentId.startsWith('tr_')) {
      sendJson(res, 200, { ok: true })
      return
    }

    const localPayment = await findPayment(providerPaymentId)

    if (!localPayment) {
      console.warn('Mollie webhook ignored for unknown payment id.')
      sendJson(res, 200, { ok: true })
      return
    }

    const molliePayment = await getMolliePayment(providerPaymentId)
    const mappedStatus = mapMollieStatus(molliePayment.status)
    const now = new Date().toISOString()
    const paidAt = mappedStatus === 'paid' ? now : localPayment.paid_at

    const updatedPayments = await updateRows(
      'payments',
      { id: `eq.${localPayment.id}` },
      {
        status: mappedStatus,
        webhook_received_at: now,
        paid_at: paidAt,
        updated_at: now,
        metadata: {
          ...(localPayment.metadata ?? {}),
          mollie_status: molliePayment.status,
        },
      },
    )
    const payment = updatedPayments[0] ?? { ...localPayment, status: mappedStatus }
    const order = await findOrder(payment.order_id)

    if (!order) {
      sendJson(res, 200, { ok: true })
      return
    }

    const nextOrderStatus = orderStatusForPayment(mappedStatus)
    const updatedOrders = await updateRows(
      'orders',
      { id: `eq.${order.id}` },
      {
        status: nextOrderStatus,
        updated_at: now,
      },
    )
    const updatedOrder = updatedOrders[0] ?? { ...order, status: nextOrderStatus }
    const invitation = await findInvitation(updatedOrder.invitation_id)

    if (invitation) {
      await updateRows(
        'order_invitations',
        { id: `eq.${invitation.id}` },
        {
          status: invitationStatusForPayment(mappedStatus),
          updated_at: now,
        },
      )
    }

    if (mappedStatus === 'paid') {
      if (!updatedOrder.customer_confirmation_sent_at) {
        const sent = await sendOrderConfirmationEmail(updatedOrder, payment)

        if (sent) {
          await updateRows(
            'orders',
            { id: `eq.${updatedOrder.id}` },
            { customer_confirmation_sent_at: new Date().toISOString() },
          )
        }
      }

      if (!updatedOrder.internal_paid_notification_sent_at) {
        const sent = await sendInternalPaidNotification(updatedOrder, payment)

        if (sent) {
          await updateRows(
            'orders',
            { id: `eq.${updatedOrder.id}` },
            { internal_paid_notification_sent_at: new Date().toISOString() },
          )
        }
      }
    }

    sendJson(res, 200, { ok: true })
  } catch (error) {
    console.error(error)
    sendJson(res, 500, { error: 'Webhook could not be processed.' })
  }
}
