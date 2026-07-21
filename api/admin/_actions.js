import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { AdminRequestError } from '../_admin.js'

export const actionRoles = {
  'invitation.preview': 'manager',
  'invitation.send': 'manager',
  'invitation.resend': 'manager',
  'quote.preview': 'manager',
  'quote.approve': 'manager',
  'fulfilment.preview': 'operator',
  'fulfilment.transition': 'operator',
  'shipping.preview': 'operator',
  'shipping.retry': 'operator',
  'origin.preview': 'manager',
  'origin.change': 'manager',
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const invitationActions = new Set(['invitation.preview', 'invitation.send', 'invitation.resend'])
const quoteActions = new Set(['quote.preview', 'quote.approve'])
const fulfilmentActions = new Set(['fulfilment.preview', 'fulfilment.transition'])
const shippingActions = new Set(['shipping.preview', 'shipping.retry'])
const originActions = new Set(['origin.preview', 'origin.change'])
const fulfilmentStatuses = new Set(['unfulfilled', 'ready_to_pack', 'packed', 'shipped'])
const fulfilmentTargets = new Set(['ready_to_pack', 'packed', 'shipped'])

function invalid(message, code = 'invalid_request') {
  throw new AdminRequestError(400, code, message)
}

function uuid(value, label) {
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid(`${label} is invalid.`)
  return value.toLowerCase()
}

function text(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim()) invalid(`${label} is required.`)
  const result = value.trim()
  if (result.length > maxLength) invalid(`${label} is too long.`)
  return result
}

function futureTimestamp(value, label) {
  const result = text(value, label, 40)
  const timestamp = new Date(result)
  if (Number.isNaN(timestamp.valueOf()) || timestamp.valueOf() <= Date.now()) invalid(`${label} must be in the future.`, 'invalid_expiry')
  if (timestamp.valueOf() > Date.now() + 366 * 24 * 60 * 60 * 1000) invalid(`${label} must be within one year.`, 'invalid_expiry')
  return timestamp.toISOString()
}

export function normalizeActionRequest(action, body) {
  if (!actionRoles[action]) invalid('Unknown operational action.', 'invalid_action')

  if (invitationActions.has(action)) {
    return { reservationId: uuid(body.reservationId, 'Reservation id') }
  }

  if (quoteActions.has(action)) {
    const countryCode = text(body.countryCode, 'Country code', 2).toUpperCase()
    if (!/^[A-Z]{2}$/.test(countryCode)) invalid('Country code is invalid.')
    const shippingAmount = Number(body.shippingAmount)
    if (!Number.isFinite(shippingAmount) || shippingAmount < 0 || shippingAmount > 10000 || Math.round(shippingAmount * 100) !== shippingAmount * 100) invalid('Shipping amount must be a non-negative amount with at most two decimals.')
    return {
      invitationId: uuid(body.invitationId, 'Invitation id'),
      countryCode,
      shippingAmount,
      currency: 'EUR',
      expiresAt: futureTimestamp(body.expiresAt, 'Quote expiry'),
      expectedInvitationUpdatedAt: text(body.expectedInvitationUpdatedAt, 'Invitation version', 40),
    }
  }

  if (fulfilmentActions.has(action)) {
    const targetStatus = text(body.targetStatus, 'Target status', 30)
    const expectedStatus = text(body.expectedStatus, 'Current status', 30)
    const expectedVersion = Number(body.expectedVersion)
    if (!fulfilmentTargets.has(targetStatus) || !fulfilmentStatuses.has(expectedStatus)) invalid('Fulfilment status is invalid.')
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) invalid('Fulfilment version is invalid.')
    const request = { orderId: uuid(body.orderId, 'Order id'), targetStatus, expectedStatus, expectedVersion }
    if (targetStatus === 'shipped') {
      request.carrier = text(body.carrier, 'Carrier', 120)
      request.trackingNumber = text(body.trackingNumber, 'Tracking number', 160)
    }
    return request
  }

  if (shippingActions.has(action)) return { orderId: uuid(body.orderId, 'Order id') }

  if (originActions.has(action)) {
    const recordOrigin = text(body.recordOrigin, 'Record origin', 40)
    const reason = text(body.reason, 'Reason', 500)
    const expectedOriginVersion = Number(body.expectedOriginVersion)
    if (!['customer', 'test', 'internal_pilot'].includes(recordOrigin)) invalid('Record origin is invalid.')
    if (reason.includes('@') || /https?:\/\//i.test(reason) || [...reason].some((character) => character.codePointAt(0) < 32)) invalid('Reason must not contain customer contact data, URLs or control characters.')
    if (!Number.isSafeInteger(expectedOriginVersion) || expectedOriginVersion < 0) invalid('Record origin version is invalid.')
    return { reservationId: uuid(body.reservationId, 'Reservation id'), recordOrigin, reason, expectedOriginVersion }
  }

  invalid('Unknown operational action.', 'invalid_action')
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function actionRequestHash(action, request) {
  return createHash('sha256').update(canonical({ action, request })).digest('hex')
}

export function deriveInvitationToken({ actorUserId, action, idempotencyKey, reservationId }) {
  const secret = process.env.ADMIN_INVITATION_TOKEN_SECRET
  if (!secret) throw new AdminRequestError(503, 'admin_unavailable', 'Invitation token generation is not configured.')
  const digest = createHmac('sha256', secret).update(canonical({ actorUserId, action, idempotencyKey, reservationId })).digest('base64url')
  return `pv_${digest}`
}

function confirmationSecret() {
  const secret = process.env.ADMIN_CONFIRMATION_SECRET
  if (!secret || secret.length < 32) throw new AdminRequestError(503, 'admin_unavailable', 'Secure action confirmation is not configured.')
  return secret
}

export function previewFingerprint(preview) {
  return createHash('sha256').update(canonical(preview)).digest('hex')
}

export function issueConfirmationProof({ actorUserId, action, requestHash, previewHash, now = Date.now() }) {
  const payload = Buffer.from(JSON.stringify({ v: 1, actorUserId, action, requestHash, previewHash, iat: now, exp: now + 10 * 60 * 1000 })).toString('base64url')
  const signature = createHmac('sha256', confirmationSecret()).update(`pv-confirm-v1.${payload}`).digest('base64url')
  return { proof: `pv-confirm-v1.${payload}.${signature}`, expiresAt: new Date(now + 10 * 60 * 1000).toISOString() }
}

export function verifyConfirmationProof(proof, { actorUserId, action, requestHash, now = Date.now(), allowExpired = false }) {
  if (typeof proof !== 'string' || proof.length > 1600) throw new AdminRequestError(409, 'confirmation_required', 'Preview and explicitly confirm this action before submitting.')
  const [prefix, encoded, supplied] = proof.split('.')
  if (prefix !== 'pv-confirm-v1' || !encoded || !supplied) throw new AdminRequestError(409, 'confirmation_invalid', 'The confirmation is not valid. Preview the action again.')
  const expected = createHmac('sha256', confirmationSecret()).update(`${prefix}.${encoded}`).digest('base64url')
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expected)
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) throw new AdminRequestError(409, 'confirmation_invalid', 'The confirmation is not valid. Preview the action again.')
  let payload
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) } catch { throw new AdminRequestError(409, 'confirmation_invalid', 'The confirmation is not valid. Preview the action again.') }
  if (payload.v !== 1 || payload.actorUserId !== actorUserId || payload.action !== action || payload.requestHash !== requestHash) throw new AdminRequestError(409, 'confirmation_mismatch', 'The confirmation does not match this action. Preview it again.')
  if (!Number.isFinite(payload.exp) || (!allowExpired && payload.exp < now) || payload.iat > now + 30_000) throw new AdminRequestError(409, 'confirmation_expired', 'The confirmation expired. Preview the action again.')
  return payload
}

export function confirmationSummary(action, preview) {
  const base = { action, record: preview.dropTitle || preview.dropSlug || preview.orderId || preview.reservationId || preview.invitationId || 'Selected record' }
  if (action.startsWith('invitation.')) return { ...base, destination: preview.maskedRecipient || 'Reservation email', externalEffect: 'Sends one invitation email in Production when delivery is configured.', reversibility: 'The email cannot be recalled after provider acceptance.' }
  if (action === 'quote.approve') return { ...base, destination: preview.countryCode, externalEffect: 'No email or payment is created.', reversibility: 'A later approved quote may replace this quote until checkout uses it.' }
  if (action === 'fulfilment.transition') return { ...base, destination: preview.targetStatus, externalEffect: preview.targetStatus === 'shipped' ? 'Marks the paid order shipped and prepares a shipping email.' : 'Updates fulfilment history only.', reversibility: 'This lifecycle transition is not reversible in Admin.' }
  if (action === 'shipping.retry') return { ...base, destination: 'Order email', externalEffect: 'Retries the prepared shipping email.', reversibility: 'The email cannot be recalled after provider acceptance.' }
  return { ...base, destination: preview.newOrigin || preview.recordOrigin, externalEffect: 'Updates linked record classification and audit history.', reversibility: 'A later audited change can correct the classification.' }
}

export function invitationTokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function invitationExpiry(now = new Date()) {
  return new Date(now.valueOf() + 7 * 24 * 60 * 60 * 1000).toISOString()
}

export function deliveryIdempotencyKey(attemptId) {
  return `poster-valley-operational-${uuid(attemptId, 'Delivery attempt id')}`
}

export function deliveryClaimId() { return randomUUID() }

export function buildOperationalMessage(payload, token = null) {
  if (payload.template === 'order_invitation') {
    if (!token) invalid('Invitation token is required.')
    const siteUrl = process.env.SITE_URL
    if (!siteUrl) throw new AdminRequestError(503, 'admin_unavailable', 'The invitation link host is not configured.')
    const orderUrl = `${siteUrl.replace(/\/$/, '')}/order/${encodeURIComponent(token)}`
    const name = payload.firstName || 'there'
    const expiry = new Date(payload.expiresAt).toLocaleDateString('en-GB')
    const support = process.env.OPERATIONAL_EMAIL_REPLY_TO || 'studio@postervalley.nl'
    return {
      to: payload.recipientEmail,
      subject: 'Your Poster Valley order invitation',
      text: [`Hi ${name},`, '', `Your reserved poster, ${payload.dropTitle}, can now be ordered.`, 'Your personal page shows the poster price, shipping and total before you decide whether to pay.', '', `Open your personal order page: ${orderUrl}`, '', `This personal link expires on ${expiry}.`, `Questions? Contact ${support}.`, '', 'Poster Valley', 'Curated poster drops, released with intention.'].join('\n'),
      html: `<div style="margin:0;background:#f2eee7;padding:32px 20px;font-family:Arial,sans-serif;color:#15120f"><main style="max-width:640px;margin:auto;background:#fff;border:1px solid #ded7cc;padding:30px"><p style="font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase">Poster Valley</p><h1 style="font-size:30px;line-height:1.15">Your poster is ready to order</h1><p>Hi ${escapeHtml(name)},</p><p>Your reserved poster, <strong>${escapeHtml(payload.dropTitle)}</strong>, can now be ordered. Your personal page shows the poster price, shipping and total before you decide whether to pay.</p><p style="margin:28px 0"><a href="${escapeHtml(orderUrl)}" style="display:inline-block;background:#080b0e;color:#fff;padding:14px 22px;text-decoration:none">Open your personal order page</a></p><p>If the button does not work, copy this link:<br><a href="${escapeHtml(orderUrl)}">${escapeHtml(orderUrl)}</a></p><p>This personal link expires on ${escapeHtml(expiry)}.</p><p>Questions? Email <a href="mailto:${escapeHtml(support)}">${escapeHtml(support)}</a>.</p><p>Poster Valley<br>Curated poster drops, released with intention.</p></main></div>`,
      template: payload.template,
    }
  }
  if (payload.template === 'shipping_confirmation') {
    return {
      to: payload.recipientEmail,
      subject: 'Your Poster Valley order has shipped',
      text: [`Hi ${payload.firstName || 'there'},`, '', `${payload.dropTitle} is on its way.`, `Carrier: ${payload.carrier}`, `Tracking number: ${payload.trackingNumber}`, '', 'Poster Valley'].join('\n'),
      template: payload.template,
    }
  }
  invalid('Unknown operational email template.')
}

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

export function mutationForPreview(action) {
  return { 'invitation.preview': 'invitation.send', 'quote.preview': 'quote.approve', 'fulfilment.preview': 'fulfilment.transition', 'shipping.preview': 'shipping.retry', 'origin.preview': 'origin.change' }[action] ?? null
}
