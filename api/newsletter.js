import {
  ensurePost,
  handleEndpointError,
  insertRow,
  parseBody,
  readConsent,
  readEmail,
  readText,
  sendJson,
} from './_supabase.js'
import { sendNewsletterNotification } from './_notifications.js'

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
      email: readEmail(body.email),
      source_path: readText(body.sourcePath, 'Source path', 240, { required: false }),
      consent_newsletter: readConsent(
        body.consentNewsletter,
        'Please confirm that Poster Valley may send you launch updates.',
      ),
      status: 'active',
    }

    await insertRow('newsletter_signups', row, { onConflict: 'email_normalized' })
    await sendNewsletterNotification(row)
    sendJson(res, 200, { ok: true })
  } catch (error) {
    handleEndpointError(res, error)
  }
}
