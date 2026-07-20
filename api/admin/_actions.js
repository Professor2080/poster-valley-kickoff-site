import { createHash, createHmac, randomUUID } from 'node:crypto'
import { AdminRequestError } from '../_admin.js'

export const actionRoles = {
  'invitation.preview': 'operator',
  'invitation.send': 'operator',
  'invitation.resend': 'operator',
  'quote.preview': 'manager',
  'quote.approve': 'manager',
  'fulfilment.preview': 'operator',
  'fulfilment.transition': 'operator',
  'shipping.preview': 'operator',
  'shipping.retry': 'operator',
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const invitationActions = new Set(['invitation.preview', 'invitation.send', 'invitation.resend'])
const quoteActions = new Set(['quote.preview', 'quote.approve'])
const fulfilmentActions = new Set(['fulfilment.preview', 'fulfilment.transition'])
const shippingActions = new Set(['shipping.preview', 'shipping.retry'])
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
  const secret = process.env.ADMIN_INVITATION_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new AdminRequestError(503, 'admin_unavailable', 'Invitation token generation is not configured.')
  const digest = createHmac('sha256', secret).update(canonical({ actorUserId, action, idempotencyKey, reservationId })).digest('base64url')
  return `pv_${digest}`
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
    const orderUrl = `${(process.env.SITE_URL || 'https://www.postervalley.nl').replace(/\/$/, '')}/order/${encodeURIComponent(token)}`
    return {
      to: payload.recipientEmail,
      subject: 'Your Poster Valley order invitation',
      text: [`Hi ${payload.firstName || 'there'},`, '', `Your reservation for ${payload.dropTitle} is ready.`, `Open your personal order page: ${orderUrl}`, '', `This link expires on ${new Date(payload.expiresAt).toLocaleDateString('en-GB')}.`, '', 'Poster Valley'].join('\n'),
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

export function mutationForPreview(action) {
  return { 'invitation.preview': 'invitation.send', 'quote.preview': 'quote.approve', 'fulfilment.preview': 'fulfilment.transition', 'shipping.preview': 'shipping.retry' }[action] ?? null
}
