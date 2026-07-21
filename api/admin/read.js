import { AdminRequestError, adminError, adminPage, adminSelect, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensurePost, PublicRequestError, readRequestBody, sendJson } from '../_supabase.js'

const resources = {
  reservations: ['admin_reservation_list_v1', 'id,created_at,drop_slug,drop_title,customer_name,masked_email,preferred_format,quantity,country_code,status,reservation_status,record_origin,record_origin_needs_review,record_origin_version', ['status', 'reservation_status', 'record_origin']],
  invitations: ['admin_invitation_list_v1', 'id,interest_request_id,drop_slug,drop_title,quantity,currency,unit_price,subtotal_amount,status,expires_at,sent_at,created_at,updated_at,record_origin,record_origin_needs_review', ['status', 'interest_request_id', 'record_origin']],
  orders: ['admin_order_list_v1', 'id,invitation_id,interest_request_id,drop_slug,drop_title,customer_name,status,payment_status,fulfilment_status,fulfilment_version,carrier,tracking_number,shipped_at,shipping_email_status,quantity,currency,subtotal_amount,shipping_amount,total_amount,shipping_country_code,created_at,updated_at,record_origin,record_origin_needs_review', ['status', 'payment_status', 'fulfilment_status', 'invitation_id', 'record_origin']],
  payments: ['admin_payment_list_v1', 'id,order_id,provider,status,amount,currency,webhook_received_at,paid_at,created_at,updated_at,record_origin,record_origin_needs_review', ['status', 'order_id', 'record_origin']],
  quotes: ['manual_shipping_quotes', 'id,invitation_id,country_code,shipping_amount,currency,expires_at,status,approved_by,created_at,updated_at', ['invitation_id', 'status']],
  email_events: ['email_delivery_events', 'id,occurred_at,actor_user_id,entity_type,entity_id,template,template_version,delivery_status,correlation_id', ['entity_type', 'entity_id', 'template', 'delivery_status'], 'occurred_at.desc'],
  audit: ['admin_audit_events', 'id,occurred_at,actor_user_id,action,entity_type,entity_id,correlation_id,idempotency_key', ['entity_type', 'entity_id', 'action'], 'occurred_at.desc'],
  events: ['entity_events', 'id,occurred_at,actor_user_id,source,event_type,entity_type,entity_id,correlation_id', ['entity_type', 'entity_id', 'event_type'], 'occurred_at.desc'],
  products: ['product_registry', 'product_code,title,lifecycle_mode,commerce_authority,woo_product_id,woo_product_url,created_at,updated_at', ['lifecycle_mode', 'commerce_authority']],
}

export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  try {
    let body
    try { body = readRequestBody(req) } catch (error) {
      if (error instanceof PublicRequestError) throw new AdminRequestError(error.status, 'invalid_request', error.message)
      throw error
    }
    await requireAdmin(req)
    const resource = typeof body.resource === 'string' ? body.resource : ''
    const definition = resources[resource]
    if (!definition) throw new AdminRequestError(400, 'invalid_resource', 'Unknown read resource.')
    const [table, select, allowedFilters, order] = definition
    const requestedFilters = body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters) ? body.filters : {}
    const filters = Object.fromEntries(allowedFilters.map((key) => {
      const value = typeof requestedFilters[key] === 'string' ? requestedFilters[key].trim() : ''
      if (value.length > 120) throw new AdminRequestError(400, 'invalid_filter', 'A filter value is too long.')
      return [key, value || null]
    }))
    const excludeOrigin = typeof requestedFilters.exclude_origin === 'string' ? requestedFilters.exclude_origin.trim() : ''
    if (excludeOrigin.length > 120) throw new AdminRequestError(400, 'invalid_filter', 'A filter value is too long.')
    const excludedOrigins = excludeOrigin.split(',').map((origin) => origin.trim()).filter(Boolean)
    if ((filters.record_origin && !['customer', 'test', 'internal_pilot'].includes(filters.record_origin)) || excludedOrigins.some((origin) => !['customer', 'test', 'internal_pilot'].includes(origin)) || new Set(excludedOrigins).size !== excludedOrigins.length) {
      throw new AdminRequestError(400, 'invalid_filter', 'Record origin is invalid.')
    }
    if (filters.record_origin && excludedOrigins.length) throw new AdminRequestError(400, 'invalid_filter', 'Choose either an origin or an origin exclusion.')
    if (excludedOrigins.length && !allowedFilters.includes('record_origin')) throw new AdminRequestError(400, 'invalid_filter', 'Origin filtering is unavailable for this resource.')
    const filterOperators = {}
    if (!filters.record_origin && excludeOrigin && allowedFilters.includes('record_origin')) {
      filters.record_origin = excludedOrigins.join(',')
      filterOperators.record_origin = 'not.in'
    }
    setAdminNoStore(res)
    sendJson(res, 200, { version: 'v1', resource, ...(await adminSelect(table, select, { ...adminPage(body), filters, filterOperators, order })) })
  } catch (error) { adminError(res, error) }
}
