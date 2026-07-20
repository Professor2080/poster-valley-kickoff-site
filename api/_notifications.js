const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.VERSEL_RESEND_API_KEY
const FORM_NOTIFICATION_TO = process.env.FORM_NOTIFICATION_TO || 'studio@postervalley.nl'
const FORM_NOTIFICATION_FROM =
  process.env.FORM_NOTIFICATION_FROM || 'Poster Valley <studio@auth.hetprojectmakersbureau.nl>'
const FORM_NOTIFICATION_REPLY_TO =
  process.env.FORM_NOTIFICATION_REPLY_TO || 'studio@postervalley.nl'
const SITE_URL = process.env.SITE_URL || 'https://www.postervalley.nl'

export function isResendConfigured() {
  return Boolean(RESEND_API_KEY)
}

// Operational mail is deliberately dry-run by default.  A separately approved
// staging release must opt in; local and automated environments never deliver.
export async function prepareOperationalEmail(message) {
  // A3 intentionally has no delivery switch: Pascal must separately approve
  // and implement a staging delivery integration. Keeping this boundary hard
  // prevents an accidental real customer email from a preview or test run.
  void message
  return { delivered: false, suppressed: true, subject: message.subject }
}

// Dependency-injected boundary used by the operational outbox. Production
// delivery is intentionally unavailable in this codebase; tests inject an
// adapter and every default invocation is a truthful suppression.
export function operationalDeliveryAdapter({ send } = {}) {
  return async (message) => {
    if (typeof send !== 'function') return { status: 'suppressed', providerId: null }
    try {
      const result = await send(message)
      return result?.accepted === true && typeof result.id === 'string' && result.id
        ? { status: 'sent', providerId: result.id }
        : { status: 'failed', providerId: null }
    } catch {
      return { status: 'failed', providerId: null }
    }
  }
}

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

function emailMoney(amount, currency = 'EUR') {
  return `${currency} ${Number(amount).toFixed(2)}`
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
              ['Poster price', `${drop.priceLabel} excl. shipping`],
            ])}
          </tbody>
        </table>
        <p style="margin:0 0 16px;color:#4f4840;font-size:15px;line-height:1.7;">Prices include VAT where applicable.</p>
        <p style="margin:0 0 16px;color:#4f4840;font-size:15px;line-height:1.7;">This is a reservation of interest, not an order and not a payment. If this poster goes into production, we will send you a personal order invitation with the final price including shipping.</p>
        <p style="margin:0 0 16px;color:#4f4840;font-size:15px;line-height:1.7;">You only enter address details later, when you choose to confirm the order through that personal link.</p>
        <p style="margin:24px 0 0;color:#15120f;font-size:15px;line-height:1.7;">Poster Valley<br/>Curated poster drops, released with intention.</p>
      </div>
    </div>
  `
}

function orderInvitationHtml({ firstName, dropTitle, orderUrl, expiresAt }) {
  const expiryText = expiresAt
    ? `This personal link expires on ${new Date(expiresAt).toLocaleDateString('en-GB')}.`
    : 'This personal link is valid for a limited time.'

  return `
    <div style="margin:0;background:#f2eee7;padding:32px 20px;font-family:Inter,Arial,sans-serif;color:#080b0e;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ded7cc;padding:30px;">
        <p style="margin:0 0 14px;color:#6d665d;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Poster Valley</p>
        <h1 style="margin:0 0 18px;font-size:30px;line-height:1.05;">Your Poster Valley order invitation</h1>
        <p style="margin:0 0 18px;color:#4f4840;font-size:15px;line-height:1.7;">Hi ${escapeHtml(firstName)}, your reservation for <strong>${escapeHtml(dropTitle)}</strong> is ready to move toward production.</p>
        <p style="margin:0 0 18px;color:#4f4840;font-size:15px;line-height:1.7;">Use your personal order page to confirm shipping details, see the poster price, shipping and total before payment, and complete the order through Mollie Checkout.</p>
        <p style="margin:0 0 18px;color:#4f4840;font-size:15px;line-height:1.7;">Prices include VAT where applicable.</p>
        <p style="margin:24px 0;"><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#080b0e;color:#f2eee7;text-decoration:none;padding:14px 22px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:0.16em;text-transform:uppercase;">Open personal order page</a></p>
        <p style="margin:0;color:#6d665d;font-size:13px;line-height:1.7;">${escapeHtml(expiryText)}</p>
      </div>
    </div>
  `
}

function orderConfirmationHtml({ order, payment }) {
  return `
    <div style="margin:0;background:#f2eee7;padding:32px 20px;font-family:Inter,Arial,sans-serif;color:#080b0e;">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #ded7cc;padding:30px;">
        <p style="margin:0 0 14px;color:#6d665d;font-size:12px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;">Poster Valley</p>
        <h1 style="margin:0 0 18px;font-size:30px;line-height:1.05;">Your Poster Valley order is confirmed.</h1>
        <p style="margin:0 0 18px;color:#4f4840;font-size:15px;line-height:1.7;">Thank you, ${escapeHtml(order.first_name)}. Your order is paid and confirmed.</p>
        <table style="width:100%;border-collapse:collapse;background:#fbfaf8;margin:24px 0;">
          <tbody>
            ${rowsHtml([
              ['Poster', order.drop_title],
              ['Quantity', order.quantity],
              ['Poster price', emailMoney(order.unit_price, order.currency)],
              ['Shipping', emailMoney(order.shipping_amount, order.currency)],
              ['Total paid', emailMoney(payment.amount ?? order.total_amount, order.currency)],
              ['Shipping country', order.shipping_country],
              ['Shipping city', order.city],
            ])}
          </tbody>
        </table>
        <p style="margin:0 0 16px;color:#4f4840;font-size:15px;line-height:1.7;">Prices include VAT where applicable.</p>
        <p style="margin:0 0 16px;color:#4f4840;font-size:15px;line-height:1.7;">We will prepare the next production and shipping steps. A shipping confirmation follows later when the poster is ready to send.</p>
        <p style="margin:24px 0 0;color:#15120f;font-size:15px;line-height:1.7;">Poster Valley<br/>Curated poster drops, released with intention.</p>
      </div>
    </div>
  `
}

async function sendEmail({ to, replyTo, subject, html, text }) {
  if (!isResendConfigured()) {
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
    `Poster price: ${drop.priceLabel} excl. shipping`,
    'Prices include VAT where applicable.',
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

export async function sendOrderInvitationEmail({ email, firstName, dropTitle, token, expiresAt }) {
  const orderUrl = `${SITE_URL.replace(/\/$/, '')}/order/${encodeURIComponent(token)}`
  const text = [
    `Hi ${firstName},`,
    '',
    `Your reservation for ${dropTitle} is ready to move toward production.`,
    'Use your personal order page to confirm shipping details, see the poster price, shipping and total before payment, and complete the order through Mollie Checkout.',
    'Prices include VAT where applicable.',
    '',
    orderUrl,
    '',
    expiresAt ? `This personal link expires on ${new Date(expiresAt).toLocaleDateString('en-GB')}.` : '',
    '',
    'Poster Valley',
  ].join('\n')

  return sendEmail({
    to: email,
    replyTo: FORM_NOTIFICATION_REPLY_TO,
    subject: 'Your Poster Valley order invitation',
    html: orderInvitationHtml({ firstName, dropTitle, orderUrl, expiresAt }),
    text,
  })
}

export async function sendOrderConfirmationEmail(order, payment) {
  const text = [
    `Hi ${order.first_name},`,
    '',
    'Your Poster Valley order is confirmed.',
    '',
    `Poster: ${order.drop_title}`,
    `Quantity: ${order.quantity}`,
    `Poster price: ${emailMoney(order.unit_price, order.currency)}`,
    `Shipping: ${emailMoney(order.shipping_amount, order.currency)}`,
    `Total paid: ${emailMoney(payment.amount ?? order.total_amount, order.currency)}`,
    `Shipping country: ${order.shipping_country}`,
    `Shipping city: ${order.city}`,
    'Prices include VAT where applicable.',
    '',
    'We will prepare the next production and shipping steps. A shipping confirmation follows later when the poster is ready to send.',
    '',
    'Poster Valley',
  ].join('\n')

  return sendEmail({
    to: order.email,
    replyTo: FORM_NOTIFICATION_REPLY_TO,
    subject: 'Your Poster Valley order is confirmed',
    html: orderConfirmationHtml({ order, payment }),
    text,
  })
}

export async function sendInternalPaidNotification(order, payment) {
  return sendAdminNotification({
    subject: `Paid Poster Valley order: ${order.drop_title}`,
    title: 'Paid order',
    intro: 'A personal order invitation has been paid.',
    rows: [
      ['Poster', order.drop_title],
      ['Quantity', order.quantity],
      ['Total', emailMoney(payment.amount ?? order.total_amount, order.currency)],
      ['Shipping country', order.shipping_country],
      ['Payment provider', payment.provider],
      ['Provider payment id', payment.provider_payment_id],
      ['Paid at', payment.paid_at],
    ],
  })
}
