import { AdminRequestError, adminError, adminSelect, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensurePost, PublicRequestError, readRequestBody, sendJson } from '../_supabase.js'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const detailResources = new Set(['reservations', 'orders'])
const historyLimit = 50

async function rows(table, select, filters, { limit = historyLimit, order = 'created_at.desc', filterOperators = {} } = {}) {
  return (await adminSelect(table, select, { limit, offset: 0, filters, filterOperators, order })).items
}

async function one(table, select, id) {
  return (await rows(table, select, { id }, { limit: 1 }))[0] ?? null
}

async function linkedRows(table, select, field, ids, options = {}) {
  if (!ids.length) return []
  return rows(table, select, { [field]: ids.join(',') }, { ...options, filterOperators: { [field]: 'in' } })
}

function ids(items) { return items.map((item) => item.id).filter((value) => typeof value === 'string') }

function orderHistoryRecord(order) {
  return Object.fromEntries(['id', 'invitation_id', 'interest_request_id', 'drop_slug', 'drop_title', 'status', 'fulfilment_status', 'fulfilment_version', 'carrier', 'tracking_number', 'shipped_at', 'shipping_email_status', 'quantity', 'currency', 'subtotal_amount', 'shipping_amount', 'total_amount', 'shipping_country_code', 'created_at', 'updated_at'].map((field) => [field, order[field]]))
}

function fulfilmentRecord(order) {
  if (!order || !order.address_line1) return null
  return Object.fromEntries(['order_id', 'shipping_name', 'shipping_company', 'address_line1', 'address_line2', 'postal_code', 'city', 'region', 'shipping_country', 'shipping_country_code'].map((field) => [field, field === 'order_id' ? order.id : order[field]]))
}

async function historyFor(reservationId, invitations, orders, payments, attempts) {
  const entityIds = [reservationId, ...ids(invitations), ...ids(orders), ...ids(payments)]
  const invitationIds = ids(invitations)
  const [quotes, emailEvents, audit, events] = await Promise.all([
    linkedRows('manual_shipping_quotes', 'id,invitation_id,country_code,shipping_amount,currency,expires_at,status,approved_by,created_at,updated_at', 'invitation_id', invitationIds),
    linkedRows('email_delivery_events', 'id,occurred_at,actor_user_id,attempt_id,entity_type,entity_id,template,template_version,delivery_status,correlation_id', 'attempt_id', ids(attempts), { order: 'occurred_at.desc' }),
    linkedRows('admin_audit_events', 'id,occurred_at,actor_user_id,action,entity_type,entity_id,correlation_id,idempotency_key,details', 'entity_id', entityIds, { order: 'occurred_at.desc' }),
    linkedRows('entity_events', 'id,occurred_at,actor_user_id,source,event_type,entity_type,entity_id,correlation_id,payload', 'entity_id', entityIds, { order: 'occurred_at.desc' }),
  ])
  return { invitations, orders, payments, quotes, email_attempts: attempts, email_events: emailEvents, audit, events }
}

async function reservationDetail(id) {
  const record = await one('drop_interest_requests', 'id,created_at,drop_id,drop_slug,drop_title,first_name,last_name,full_name,email,country,country_code,preferred_format,quantity,status,reservation_status,record_origin,record_origin_needs_review,record_origin_version', id)
  if (!record) throw new AdminRequestError(404, 'not_found', 'The requested record was not found.')
  const [invitations, orderRecords, attempts] = await Promise.all([
    rows('order_invitations', 'id,interest_request_id,drop_slug,drop_title,quantity,currency,unit_price,subtotal_amount,status,expires_at,sent_at,opened_at,created_at,updated_at', { interest_request_id: id }),
    rows('orders', 'id,invitation_id,interest_request_id,drop_slug,drop_title,status,shipping_name,shipping_company,address_line1,address_line2,postal_code,city,region,shipping_country,shipping_country_code,fulfilment_status,fulfilment_version,carrier,tracking_number,shipped_at,shipping_email_status,quantity,currency,subtotal_amount,shipping_amount,total_amount,created_at,updated_at', { interest_request_id: id }),
    rows('operational_email_attempts', 'id,actor_user_id,action,idempotency_key,template,template_version,entity_type,entity_id,delivery_status,created_at,completed_at', { interest_request_id: id }),
  ])
  const orders = orderRecords.map(orderHistoryRecord)
  const paymentRecords = await linkedRows('payments', 'id,order_id,provider,provider_payment_id,status,amount,currency,webhook_received_at,paid_at,created_at,updated_at', 'order_id', ids(orders))
  const paidOrder = orderRecords.find((order) => paymentRecords.some((payment) => payment.order_id === order.id && payment.provider === 'mollie' && payment.provider_payment_id && payment.status === 'paid' && payment.webhook_received_at && payment.paid_at && Number(payment.amount) === Number(order.total_amount) && payment.currency === order.currency))
  const payments = paymentRecords.map(({ provider_payment_id: _providerPaymentId, ...payment }) => payment)
  return { record, fulfilment: fulfilmentRecord(paidOrder), history: await historyFor(id, invitations, orders, payments, attempts) }
}

async function orderDetail(id) {
  const record = await one('orders', 'id,invitation_id,interest_request_id,drop_slug,drop_title,status,email,first_name,last_name,shipping_name,shipping_company,address_line1,address_line2,postal_code,city,region,shipping_country,shipping_country_code,fulfilment_status,fulfilment_version,carrier,tracking_number,shipped_at,shipping_email_status,quantity,currency,subtotal_amount,shipping_amount,total_amount,created_at,updated_at', id)
  if (!record) throw new AdminRequestError(404, 'not_found', 'The requested record was not found.')
  const reservationId = typeof record.interest_request_id === 'string' ? record.interest_request_id : ''
  const [reservation, invitation, paymentRecords, attempts] = await Promise.all([
    reservationId ? one('drop_interest_requests', 'id,created_at,drop_slug,drop_title,full_name,status,reservation_status,record_origin,record_origin_needs_review,record_origin_version', reservationId) : null,
    one('order_invitations', 'id,interest_request_id,drop_slug,drop_title,quantity,status,expires_at,sent_at,opened_at,created_at,updated_at', record.invitation_id),
    rows('payments', 'id,order_id,provider,status,amount,currency,webhook_received_at,paid_at,created_at,updated_at', { order_id: id }),
    reservationId ? rows('operational_email_attempts', 'id,actor_user_id,action,idempotency_key,template,template_version,entity_type,entity_id,delivery_status,created_at,completed_at', { interest_request_id: reservationId }) : [],
  ])
  const payments = paymentRecords.map(({ provider_payment_id: _providerPaymentId, ...payment }) => payment)
  const invitations = invitation ? [invitation] : []
  record.customer_name = `${record.first_name ?? ''} ${record.last_name ?? ''}`.trim()
  record.payment_status = payments[0]?.status ?? null
  record.record_origin = reservation?.record_origin ?? 'customer'
  record.record_origin_needs_review = reservation?.record_origin_needs_review ?? true
  record.record_origin_version = reservation?.record_origin_version ?? 0
  const orders = [{ id: record.id, status: record.status, fulfilment_status: record.fulfilment_status, fulfilment_version: record.fulfilment_version, carrier: record.carrier, tracking_number: record.tracking_number, shipped_at: record.shipped_at, shipping_email_status: record.shipping_email_status, created_at: record.created_at, updated_at: record.updated_at }]
  const history = await historyFor(reservationId || id, invitations, orders, payments, attempts)
  history.reservation = reservation ? [reservation] : []
  return { record, fulfilment: null, history }
}

export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  try {
    let body
    try { body = readRequestBody(req) } catch (error) {
      if (error instanceof PublicRequestError) throw new AdminRequestError(error.status, 'invalid_request', error.message)
      throw error
    }
    await requireAdmin(req, 'manager')
    const resource = typeof body.resource === 'string' ? body.resource : ''
    const id = typeof body.id === 'string' ? body.id.toLowerCase() : ''
    if (!detailResources.has(resource) || !uuidPattern.test(id)) throw new AdminRequestError(400, 'invalid_request', 'A supported detail record is required.')
    const detail = resource === 'reservations' ? await reservationDetail(id) : await orderDetail(id)
    setAdminNoStore(res)
    sendJson(res, 200, { version: 'v1', resource, ...detail })
  } catch (error) { adminError(res, error) }
}
