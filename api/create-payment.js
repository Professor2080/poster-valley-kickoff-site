import {
  canStartPayment,
  isInvitationExpired,
  mollieAmountValue,
  quoteForInvitation,
  applyApprovedManualQuote,
  readInvitationToken,
  readShippingAddress,
} from './_commerce.js'
import { createMolliePayment, isMollieConfigured, mapMollieStatus } from './_mollie.js'
import {
  createRow,
  ensurePost,
  handleEndpointError,
  PublicRequestError,
  readConsent,
  readRequestBody,
  selectRows,
  sendJson,
  updateRows,
} from './_supabase.js'
import { findInvitationByToken } from './_invitation-token.js'

const SITE_URL = process.env.SITE_URL || 'https://www.postervalley.nl'

export default async function handler(req, res) {
  if (!ensurePost(req, res)) {
    return
  }

  try {
    const body = readRequestBody(req)
    const token = readInvitationToken(body.token)
    const invitation = await findInvitationByToken(token)

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

    if (!canStartPayment(invitation)) {
      throw new PublicRequestError('This order invitation can no longer be used.', 409)
    }

    const acceptedTerms = readConsent(
      body.acceptedTerms,
      'Please confirm the order terms before continuing.',
    )
    const address = readShippingAddress(body)

    if (address.email !== invitation.email_normalized) {
      throw new PublicRequestError('The email address does not match this invitation.', 400)
    }

    const baseQuote = quoteForInvitation(invitation, address.countryCode)
    const quotes = !baseQuote.supported && baseQuote.reviewNeeded
      ? await selectRows('manual_shipping_quotes', { invitation_id: `eq.${invitation.id}`, country_code: `eq.${baseQuote.countryCode}`, currency: `eq.${baseQuote.currency}`, status: 'eq.approved', expires_at: `gt.${new Date().toISOString()}`, select: 'id,country_code,currency,shipping_amount,status,expires_at', order: 'created_at.desc', limit: 1 })
      : []
    const quote = applyApprovedManualQuote(invitation, baseQuote.countryCode, baseQuote, quotes[0])

    if (!quote.supported) {
      throw new PublicRequestError(quote.reason, 400)
    }

    if (!isMollieConfigured()) {
      throw new PublicRequestError('Payment is not configured yet.', 503)
    }

    const now = new Date().toISOString()
    const order = await createRow('orders', {
      invitation_id: invitation.id,
      interest_request_id: invitation.interest_request_id,
      drop_id: invitation.drop_id,
      drop_slug: invitation.drop_slug,
      drop_title: invitation.drop_title,
      status: 'awaiting_payment',
      email: invitation.email,
      first_name: address.firstName,
      last_name: address.lastName,
      quantity: invitation.quantity,
      currency: quote.currency,
      unit_price: quote.unitPrice,
      subtotal_amount: quote.subtotal,
      shipping_amount: quote.shipping,
      total_amount: quote.total,
      shipping_profile_id: quote.shippingProfileId,
      ...(quote.manualQuoteId ? { manual_shipping_quote_id: quote.manualQuoteId } : {}),
      shipping_country: quote.countryName,
      shipping_country_code: quote.countryCode,
      shipping_name: address.shippingName,
      shipping_company: address.company,
      address_line1: address.addressLine1,
      address_line2: address.addressLine2,
      postal_code: address.postalCode,
      city: address.city,
      region: address.region,
      accepted_terms_at: acceptedTerms ? now : null,
      metadata: {
        shipping_label: quote.shippingLabel,
        shipping_note: quote.shippingNote,
        shipping_review_needed: quote.reviewNeeded,
        manual_quote_id: quote.manualQuoteId ?? null,
        manual_quote_expires_at: quote.manualQuoteId ? quotes[0]?.expires_at : null,
      },
    })

    await updateRows(
      'order_invitations',
      { id: `eq.${invitation.id}` },
      { status: 'order_started', updated_at: now },
    )

    const redirectUrl = `${SITE_URL.replace(/\/$/, '')}/order/${encodeURIComponent(
      token,
    )}?payment=return`
    const webhookUrl = `${SITE_URL.replace(/\/$/, '')}/api/mollie/webhook`

    try {
      const payment = await createMolliePayment({
        amount: {
          currency: quote.currency,
          value: mollieAmountValue(quote.total),
        },
        description: `Poster Valley ${invitation.drop_title}`,
        redirectUrl,
        cancelUrl: redirectUrl,
        webhookUrl,
        locale: 'en_GB',
        metadata: {
          order_id: order.id,
          invitation_id: invitation.id,
          drop_slug: invitation.drop_slug,
        },
        shippingAddress: {
          givenName: address.firstName,
          familyName: address.lastName,
          email: address.email,
          streetAndNumber: address.addressLine1,
          streetAdditional: address.addressLine2,
          postalCode: address.postalCode,
          city: address.city,
          region: address.region,
          country: address.countryCode,
          ...(address.company ? { organizationName: address.company } : {}),
        },
        billingAddress: {
          givenName: address.firstName,
          familyName: address.lastName,
          email: address.email,
          streetAndNumber: address.addressLine1,
          streetAdditional: address.addressLine2,
          postalCode: address.postalCode,
          city: address.city,
          region: address.region,
          country: address.countryCode,
          ...(address.company ? { organizationName: address.company } : {}),
        },
      })

      const mappedStatus = mapMollieStatus(payment.status)

      await createRow('payments', {
        order_id: order.id,
        provider: 'mollie',
        provider_payment_id: payment.id,
        status: mappedStatus === 'open' ? 'open' : mappedStatus,
        amount: quote.total,
        currency: quote.currency,
        checkout_url: payment.checkoutUrl,
        redirect_url: redirectUrl,
        metadata: {
          mollie_status: payment.status,
        },
      })

      await updateRows(
        'orders',
        { id: `eq.${order.id}` },
        { status: 'payment_open', updated_at: new Date().toISOString() },
      )
      await updateRows(
        'order_invitations',
        { id: `eq.${invitation.id}` },
        { status: 'payment_open', updated_at: new Date().toISOString() },
      )

      sendJson(res, 200, {
        ok: true,
        checkoutUrl: payment.checkoutUrl,
      })
    } catch (error) {
      await updateRows(
        'orders',
        { id: `eq.${order.id}` },
        { status: 'payment_failed', updated_at: new Date().toISOString() },
      )
      throw error
    }
  } catch (error) {
    handleEndpointError(res, error)
  }
}
