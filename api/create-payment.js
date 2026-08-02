import { randomUUID } from 'node:crypto'
import {
  isInvitationExpired,
  mollieAmountValue,
  paymentStartRequestHash,
  quoteForInvitation,
  applyApprovedManualQuote,
  readInvitationToken,
  readShippingAddress,
} from './_commerce.js'
import { createMolliePayment, isMollieConfigured, mapMollieStatus } from './_mollie.js'
import {
  callRpc,
  ensurePost,
  handleEndpointError,
  PublicRequestError,
  readConsent,
  readRequestBody,
  selectRows,
  sendJson,
  SupabaseRequestError,
} from './_supabase.js'
import { findInvitationByToken } from './_invitation-token.js'

const SITE_URL = process.env.SITE_URL || 'https://www.postervalley.nl'
const terminalPaymentStatuses = new Set(['failed', 'expired', 'canceled'])

function translatePaymentRpcError(error) {
  if (!(error instanceof SupabaseRequestError)) return error

  const known = {
    payment_invitation_not_found: ['This order invitation link is not valid.', 404],
    payment_invitation_expired: ['This order invitation has expired.', 410],
    payment_invitation_unusable: ['This order invitation can no longer be used.', 409],
    payment_idempotency_conflict: ['This invitation was already used with different order details.', 409],
    payment_claim_lost: ['Payment start is already being processed. Please retry in a moment.', 409],
    payment_state_conflict: ['Payment start requires reconciliation before it can continue.', 409],
    payment_result_conflict: ['The payment provider result does not match the existing payment.', 409],
  }[error.databaseCode]

  return known ? new PublicRequestError(...known) : error
}

async function paymentRpc(functionName, body) {
  try {
    return await callRpc(functionName, body)
  } catch (error) {
    throw translatePaymentRpcError(error)
  }
}

function sendExistingPayment(res, claim) {
  if (claim.paymentStatus === 'open' && claim.checkoutUrl) {
    sendJson(res, 200, { ok: true, checkoutUrl: claim.checkoutUrl, paymentStatus: 'open' })
    return true
  }

  if (claim.paymentStatus === 'paid') {
    sendJson(res, 200, { ok: true, paymentStatus: 'paid' })
    return true
  }

  if (terminalPaymentStatuses.has(claim.paymentStatus)) {
    throw new PublicRequestError('This payment attempt is closed and cannot be started again.', 409)
  }

  if (claim.paymentStatus === 'unknown' || claim.paymentStartStatus === 'reconciliation_required') {
    throw new PublicRequestError('Payment status requires reconciliation before it can continue.', 409)
  }

  if (!claim.claimOwner) {
    sendJson(res, 202, { ok: true, paymentStatus: 'processing' })
    return true
  }

  return false
}

async function completePaymentStart(body) {
  try {
    return await paymentRpc('payment_start_complete', body)
  } catch (firstError) {
    try {
      return await paymentRpc('payment_start_complete', body)
    } catch {
      throw firstError
    }
  }
}

export default async function handler(req, res) {
  if (!ensurePost(req, res)) return

  try {
    const body = readRequestBody(req)
    const token = readInvitationToken(body.token)
    const invitation = await findInvitationByToken(token)

    if (!invitation) {
      throw new PublicRequestError('This order invitation link is not valid.', 404)
    }

    if (isInvitationExpired(invitation)) {
      throw new PublicRequestError('This order invitation has expired.', 410)
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

    const now = new Date().toISOString()
    const requestHash = paymentStartRequestHash({ invitation, quote, address, acceptedTerms })
    const claimId = randomUUID()
    const redirectUrl = `${SITE_URL.replace(/\/$/, '')}/order/${encodeURIComponent(
      token,
    )}?payment=return`
    const webhookUrl = `${SITE_URL.replace(/\/$/, '')}/api/mollie/webhook`
    const orderMetadata = {
      shipping_label: quote.shippingLabel,
      shipping_note: quote.shippingNote,
      shipping_review_needed: quote.reviewNeeded,
      manual_quote_id: quote.manualQuoteId ?? null,
      manual_quote_expires_at: quote.manualQuoteId ? quotes[0]?.expires_at : null,
    }

    const claim = await paymentRpc('payment_start_claim', {
      p_invitation_id: invitation.id,
      p_request_hash: requestHash,
      p_claim_id: claimId,
      p_order: {
        interest_request_id: invitation.interest_request_id,
        drop_id: invitation.drop_id,
        drop_slug: invitation.drop_slug,
        drop_title: invitation.drop_title,
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
        manual_shipping_quote_id: quote.manualQuoteId ?? null,
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
        metadata: orderMetadata,
      },
    })

    if (sendExistingPayment(res, claim)) return

    if (!isMollieConfigured()) {
      throw new PublicRequestError('Payment is not configured yet.', 503)
    }

    const begun = await paymentRpc('payment_start_begin_provider', {
      p_order_id: claim.orderId,
      p_request_hash: requestHash,
      p_claim_id: claimId,
    })

    if (!begun.started) {
      if (sendExistingPayment(res, begun)) return
      sendJson(res, 202, { ok: true, paymentStatus: 'processing' })
      return
    }

    let payment
    try {
      payment = await createMolliePayment({
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
          order_id: claim.orderId,
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
      }, claim.providerIdempotencyKey)
    } catch (error) {
      try {
        await paymentRpc('payment_start_mark_reconciliation', {
          p_order_id: claim.orderId,
          p_request_hash: requestHash,
          p_claim_id: claimId,
        })
      } catch {
        // The persisted provider_pending state is already fail-closed if reconciliation marking fails.
      }
      throw error
    }

    const mappedStatus = mapMollieStatus(payment.status)
    const completed = await completePaymentStart({
      p_order_id: claim.orderId,
      p_request_hash: requestHash,
      p_claim_id: claimId,
      p_provider_payment_id: payment.id,
      p_payment_status: mappedStatus === 'open' ? 'open' : mappedStatus,
      p_amount: quote.total,
      p_currency: quote.currency,
      p_checkout_url: payment.checkoutUrl,
      p_redirect_url: redirectUrl,
      p_metadata: { mollie_status: payment.status },
    })

    if (sendExistingPayment(res, completed)) return
    throw new PublicRequestError('Payment status requires reconciliation before it can continue.', 409)
  } catch (error) {
    handleEndpointError(res, error)
  }
}
