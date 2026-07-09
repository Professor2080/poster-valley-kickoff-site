const RESEND_API_KEY = process.env.RESEND_API_KEY
const FORM_NOTIFICATION_TO = process.env.FORM_NOTIFICATION_TO || 'studio@postervalley.nl'
const FORM_NOTIFICATION_FROM =
  process.env.FORM_NOTIFICATION_FROM || 'Poster Valley <onboarding@resend.dev>'
const FORM_NOTIFICATION_REPLY_TO =
  process.env.FORM_NOTIFICATION_REPLY_TO || 'studio@postervalley.nl'
const SITE_URL = process.env.SITE_URL || 'https://www.postervalley.nl'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function valueOrDash(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  return String(value)
}

function sourceUrl(sourcePath) {
  if (!sourcePath) {
    return SITE_URL
  }

  try {
    return new URL(sourcePath, SITE_URL).toString()
  } catch {
    return SITE_URL
  }
}

function rowsHtml(rows) {
  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e6e1d8;color:#6d665d;font-size:13px;">${escapeHtml(label)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e6e1d8;color:#15120f;font-size:14px;">${escapeHtml(valueOrDash(value))}</td>
        </tr>
      `,
    )
    .join('')
}

function rowsText(rows) {
  return rows.map(([label, value]) => `${label}: ${valueOrDash(value)}`).join('\n')
}

function notificationHtml(title, intro, rows) {
  return `
    <div style="margin:0;background:#f2eee7;padding:32px 20px;font-family:Inter,Arial,sans-serif;color:#080b0e;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ded7cc;padding:28px;">
        <p style="margin:0 0 12px;color:#6d665d;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Poster Valley</p>
        <h1 style="margin:0 0 16px;font-size:28px;line-height:1.05;">${escapeHtml(title)}</h1>
        <p style="margin:0 0 24px;color:#4f4840;font-size:15px;line-height:1.6;">${escapeHtml(intro)}</p>
        <table style="width:100%;border-collapse:collapse;background:#fbfaf8;">
          <tbody>
            ${rowsHtml(rows)}
          </tbody>
        </table>
      </div>
    </div>
  `
}

async function sendAdminNotification({ subject, title, intro, rows }) {
  if (!RESEND_API_KEY) {
    console.warn('Resend notification skipped: RESEND_API_KEY is not configured.')
    return
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FORM_NOTIFICATION_FROM,
      to: [FORM_NOTIFICATION_TO],
      reply_to: FORM_NOTIFICATION_REPLY_TO,
      subject,
      html: notificationHtml(title, intro, rows),
      text: `${title}\n\n${intro}\n\n${rowsText(rows)}`,
    }),
  })

  if (!response.ok) {
    const detail = await response.text()
    console.error(`Resend notification failed with ${response.status}: ${detail}`)
  }
}

export async function sendDropInterestNotification(row) {
  const rows = [
    ['Poster', row.drop_title],
    ['Name', row.full_name],
    ['Email', row.email],
    ['Country', row.country],
    ['Quantity', row.quantity],
    ['Format', row.preferred_format],
    ['Note', row.note],
    ['Source', sourceUrl(row.source_path)],
    ['Submitted at', new Date().toISOString()],
  ]

  await sendAdminNotification({
    subject: `New poster reservation: ${row.drop_title}`,
    title: 'New poster reservation',
    intro: 'A visitor submitted a poster-specific reservation on the kickoff site.',
    rows,
  })
}

export async function sendNewsletterNotification(row) {
  const rows = [
    ['Email', row.email],
    ['Source', sourceUrl(row.source_path)],
    ['Submitted at', new Date().toISOString()],
  ]

  await sendAdminNotification({
    subject: 'New Poster Valley update signup',
    title: 'New update signup',
    intro: 'A visitor joined the general Poster Valley update list.',
    rows,
  })
}
