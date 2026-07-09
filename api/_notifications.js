const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.VERSEL_RESEND_API_KEY
const FORM_NOTIFICATION_TO = process.env.FORM_NOTIFICATION_TO || 'studio@postervalley.nl'
const FORM_NOTIFICATION_FROM =
  process.env.FORM_NOTIFICATION_FROM || 'Poster Valley <studio@auth.hetprojectmakersbureau.nl>'
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

function customerHtml({ firstName, drop, quantity, country }) {
  return `
    <div style="margin:0;background:#f2eee7;padding:32px 20px;font-family:Inter,Arial,sans-serif;color:#080b0e;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ded7cc;padding:30px;">
        <p style="margin:0 0 14px;color:#6d665d;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Poster Valley</p>
        <h1 style="margin:0 0 18px;font-size:30px;line-height:1.05;">Your reservation is confirmed.</h1>
        <p style="margin:0 0 18px;color:#4f4840;font-size:15px;line-height:1.7;">Hi ${escapeHtml(firstName)}, thank you for reserving interest in <strong>${escapeHtml(drop.title)}</strong>.</p>
        <table style="width:100%;border-collapse:collapse;background:#fbfaf8;margin:24px 0;">
          <tbody>
            ${rowsHtml([
              ['Poster', drop.title],
              ['Quantity', quantity],
              ['Country', country],
              ['Format', drop.dimensionsLabel],
              ['Current poster price', `${drop.priceLabel} excl. shipping`],
            ])}
          </tbody>
        </table>
        <p style="margin:0 0 16px;color:#4f4840;font-size:15px;line-height:1.7;">This is a reservation of interest, not an order and not a payment. If this poster goes into production, we will send you a personal order invitation with the final price including shipping.</p>
        <p style="margin:0 0 16px;color:#4f4840;font-size:15px;line-height:1.7;">You only enter address details later, when you choose to confirm the order through that personal link.</p>
        <p style="margin:24px 0 0;color:#15120f;font-size:15px;line-height:1.7;">Poster Valley<br/>Curated poster drops, released with intention.</p>
      </div>
    </div>
  `
}

async function sendEmail({ to, replyTo, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.warn('Resend notification skipped: RESEND_API_KEY is not configured.')
    return false
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FORM_NOTIFICATION_FROM,
      to: Array.isArray(to) ? to : [to],
      reply_to: replyTo,
      subject,
      html,
      text,
    }),
  })

  if (!response.ok) {
    console.error(`Resend notification failed with ${response.status}.`)
    return false
  }

  return true
}

async function sendAdminNotification({ subject, title, intro, rows }) {
  return sendEmail({
    to: FORM_NOTIFICATION_TO,
    replyTo: FORM_NOTIFICATION_REPLY_TO,
    subject,
    html: notificationHtml(title, intro, rows),
    text: `${title}\n\n${intro}\n\n${rowsText(rows)}`,
  })
}

export async function sendDropInterestNotification(row) {
  const rows = [
    ['Poster', row.drop_title],
    ['Name', row.full_name],
    ['Email', row.email],
    ['Country', row.country],
    ['Quantity', row.quantity],
    ['Format', row.preferred_format],
    ['Reservation terms accepted', row.accepted_reservation_terms ? 'Yes' : 'No'],
    ['Future drops opt-in', row.marketing_opt_in ? 'Yes' : 'No'],
    ['Note', row.note],
    ['Source', sourceUrl(row.source_path)],
    ['Submitted at', new Date().toISOString()],
  ]

  return sendAdminNotification({
    subject: `New poster reservation: ${row.drop_title}`,
    title: 'New poster reservation',
    intro: 'A visitor submitted a poster-specific reservation on the kickoff site.',
    rows,
  })
}

export async function sendCustomerReservationConfirmation(row, drop) {
  const firstName = row.first_name || row.full_name
  const text = [
    `Hi ${firstName},`,
    '',
    `Thank you for reserving interest in ${drop.title}.`,
    '',
    `Poster: ${drop.title}`,
    `Quantity: ${row.quantity}`,
    `Country: ${row.country}`,
    `Format: ${drop.dimensionsLabel}`,
    `Current poster price: ${drop.priceLabel} excl. shipping`,
    '',
    'This is a reservation of interest, not an order and not a payment.',
    'If this poster goes into production, we will send you a personal order invitation with the final price including shipping.',
    'You only enter address details later, when you choose to confirm the order through that personal link.',
    '',
    'Poster Valley',
    'Curated poster drops, released with intention.',
  ].join('\n')

  return sendEmail({
    to: row.email,
    replyTo: FORM_NOTIFICATION_REPLY_TO,
    subject: 'Your Poster Valley reservation is confirmed',
    html: customerHtml({ firstName, drop, quantity: row.quantity, country: row.country }),
    text,
  })
}

export async function sendNewsletterNotification(row) {
  const rows = [
    ['Email', row.email],
    ['Source', sourceUrl(row.source_path)],
    ['Submitted at', new Date().toISOString()],
  ]

  return sendAdminNotification({
    subject: 'New Poster Valley update signup',
    title: 'New update signup',
    intro: 'A visitor joined the general Poster Valley update list.',
    rows,
  })
}
