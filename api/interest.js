import { getReservableDropBySlug } from './_drops.js'
import {
  ensurePost,
  handleEndpointError,
  insertRow,
  PublicRequestError,
  readConsent,
  readCountry,
  readEmail,
  readOptionalBoolean,
  readQuantity,
  readRequestBody,
  readSourcePath,
  readText,
  sendJson,
} from './_supabase.js'
import {
  sendCustomerReservationConfirmation,
  sendDropInterestNotification,
} from './_notifications.js'

export default async function handler(req, res) {
  if (!ensurePost(req, res)) {
    return
  }

  try {
    const body = readRequestBody(req)

    if (body.company) {
      sendJson(res, 200, { ok: true })
      return
    }

    const dropSlug = readText(body.dropSlug, 'Drop', 120)
    const drop = getReservableDropBySlug(dropSlug)

    if (!drop) {
      throw new PublicRequestError('This poster is not accepting reservations.')
    }

    const firstName = readText(body.firstName, 'First name', 120)
    const lastName = readText(body.lastName, 'Last name', 120)
    const email = readEmail(body.email)
    const country = readCountry(body.country)
    const quantity = readQuantity(body.quantity)
    const acceptedReservationTerms = readConsent(
      body.acceptedReservationTerms,
      'Please confirm that this is a reservation of interest, not an order or payment.',
    )
    const marketingOptIn = readOptionalBoolean(body.marketingOptIn)

    const row = {
      drop_id: drop.id,
      drop_slug: drop.slug,
      drop_title: drop.title,
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`,
      email,
      email_normalized: email,
      country,
      country_code: null,
      preferred_format: drop.dimensionsLabel,
      quantity,
      shipping_address: null,
      note: readText(body.note, 'Note', 1200, { required: false }),
      source_path: readSourcePath(body.sourcePath),
      consent_contact: acceptedReservationTerms,
      accepted_reservation_terms: acceptedReservationTerms,
      marketing_opt_in: marketingOptIn,
      reservation_status: 'new',
      status: 'new',
      record_origin: 'customer',
      record_origin_needs_review: false,
      metadata: {
        product_type: drop.productType,
        edition_label: drop.editionLabel,
        base_price: drop.basePrice,
        currency: drop.currency,
        price_label: drop.priceLabel,
        shipping_profile_id: drop.shippingProfileId,
        order_mode: drop.orderMode,
      },
    }

    await insertRow('drop_interest_requests', row)
    await sendDropInterestNotification(row)
    const customerEmailSent = await sendCustomerReservationConfirmation(row, drop)

    sendJson(res, 200, { ok: true, customerEmailSent })
  } catch (error) {
    handleEndpointError(res, error)
  }
}
