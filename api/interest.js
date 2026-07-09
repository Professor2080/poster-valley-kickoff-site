import {
  ensurePost,
  handleEndpointError,
  insertRow,
  parseBody,
  readConsent,
  readEmail,
  readQuantity,
  readText,
  sendJson,
} from './_supabase.js'
import { sendDropInterestNotification } from './_notifications.js'

export default async function handler(req, res) {
  if (!ensurePost(req, res)) {
    return
  }

  try {
    const body = parseBody(req.body)

    if (body.company) {
      sendJson(res, 200, { ok: true })
      return
    }

    const row = {
      drop_slug: readText(body.dropSlug, 'Drop', 120),
      drop_title: readText(body.dropTitle, 'Drop title', 180),
      full_name: readText(body.name, 'Full name', 180),
      email: readEmail(body.email),
      country: readText(body.country, 'Country', 120),
      preferred_format: readText(body.format, 'Preferred format', 80),
      quantity: readQuantity(body.quantity),
      shipping_address: readText(body.address, 'Shipping address', 1200, { required: false }),
      note: readText(body.note, 'Note', 1200, { required: false }),
      source_path: readText(body.sourcePath, 'Source path', 240, { required: false }),
      consent_contact: readConsent(
        body.consentContact,
        'Please confirm that Poster Valley may contact you about this poster request.',
      ),
      status: 'new',
    }

    await insertRow('drop_interest_requests', row)
    await sendDropInterestNotification(row)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    handleEndpointError(res, error)
  }
}
