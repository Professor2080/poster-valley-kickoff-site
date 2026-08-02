import { AdminRequestError, adminError, adminPage, adminRpc, adminSelect, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensurePost, PublicRequestError, readRequestBody, sendJson } from '../_supabase.js'

const resources = {
  reservations: ['admin_reservation_list_v1', 'id,created_at,drop_slug,drop_title,customer_name,masked_email,preferred_format,quantity,country_code,status,reservation_status,record_origin,record_origin_needs_review,record_origin_version', ['status', 'reservation_status', 'record_origin']],
  invitations: ['admin_invitation_list_v1', 'id,interest_request_id,drop_slug,drop_title,quantity,currency,unit_price,subtotal_amount,status,expires_at,sent_at,created_at,updated_at,record_origin,record_origin_needs_review,delivery_status,delivery_completed_at', ['status', 'interest_request_id', 'record_origin']],
  orders: ['admin_order_list_v1', 'id,invitation_id,interest_request_id,drop_slug,drop_title,customer_name,status,payment_status,fulfilment_status,fulfilment_version,carrier,tracking_number,shipped_at,shipping_email_status,shipping_reconciliation_required,quantity,currency,subtotal_amount,shipping_amount,total_amount,shipping_country_code,created_at,updated_at,record_origin,record_origin_needs_review', ['status', 'payment_status', 'fulfilment_status', 'invitation_id', 'record_origin']],
  payments: ['admin_payment_list_v1', 'id,order_id,provider,status,amount,currency,webhook_received_at,paid_at,created_at,updated_at,record_origin,record_origin_needs_review', ['status', 'order_id', 'record_origin']],
  quotes: ['manual_shipping_quotes', 'id,invitation_id,country_code,shipping_amount,currency,expires_at,status,approved_by,created_at,updated_at', ['invitation_id', 'status']],
  email_events: ['email_delivery_events', 'id,occurred_at,actor_user_id,entity_type,entity_id,template,template_version,delivery_status,correlation_id', ['entity_type', 'entity_id', 'template', 'delivery_status'], 'occurred_at.desc'],
  audit: ['admin_audit_events', 'id,occurred_at,actor_user_id,action,entity_type,entity_id,correlation_id,idempotency_key', ['entity_type', 'entity_id', 'action'], 'occurred_at.desc'],
  events: ['entity_events', 'id,occurred_at,actor_user_id,source,event_type,entity_type,entity_id,correlation_id', ['entity_type', 'entity_id', 'event_type'], 'occurred_at.desc'],
  products: ['product_registry', 'product_code,drop_slug,title,lifecycle_mode,production_threshold,invitations_opened_at,commerce_authority,woo_product_id,woo_product_url,created_at,updated_at', ['lifecycle_mode', 'commerce_authority']],
}

const boardStages = new Set(['new', 'interest', 'ready_to_invite', 'awaiting_payment', 'paid_to_ship', 'shipped', 'closed'])

function boardFilter(value, label, maxLength = 120) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > maxLength) throw new AdminRequestError(400, 'invalid_filter', `${label} is invalid.`)
  return value.trim()
}

async function orderFlowRead(admin, body) {
  const requested = body.filters && typeof body.filters === 'object' && !Array.isArray(body.filters) ? body.filters : {}
  const search = boardFilter(requested.search, 'Search')
  const dropSlug = boardFilter(requested.drop_slug, 'Drop')
  const sourceType = boardFilter(requested.source_type, 'Card type')
  const stage = boardFilter(requested.stage, 'Stage')
  const attention = boardFilter(requested.needs_attention, 'Attention filter', 5)
  const includeClosed = boardFilter(requested.include_closed, 'Archive filter', 5)
  if (dropSlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(dropSlug)) throw new AdminRequestError(400, 'invalid_filter', 'Drop is invalid.')
  if (sourceType && !['drop', 'shop_order'].includes(sourceType)) throw new AdminRequestError(400, 'invalid_filter', 'Card type is invalid.')
  if (stage && !boardStages.has(stage)) throw new AdminRequestError(400, 'invalid_filter', 'Stage is invalid.')
  if (attention && attention !== 'true') throw new AdminRequestError(400, 'invalid_filter', 'Attention filter is invalid.')
  if (includeClosed && includeClosed !== 'true') throw new AdminRequestError(400, 'invalid_filter', 'Archive filter is invalid.')
  const page = adminPage(body)
  const result = await adminRpc('admin_order_flow_read', {
    p_actor: admin.userId,
    p_search: search,
    p_drop_slug: dropSlug,
    p_source_type: sourceType,
    p_stage: stage,
    p_needs_attention: attention ? true : null,
    p_include_closed: Boolean(includeClosed),
    p_limit: page.limit,
    p_offset: page.offset,
  })
  return { version: 'v1', resource: 'order_flow', ...result }
}

export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  try {
    let body
    try { body = readRequestBody(req) } catch (error) {
      if (error instanceof PublicRequestError) throw new AdminRequestError(error.status, 'invalid_request', error.message)
      throw error
    }
    const admin = await requireAdmin(req)
    const resource = typeof body.resource === 'string' ? body.resource : ''
    if (resource === 'order_flow') {
      setAdminNoStore(res)
      sendJson(res, 200, await orderFlowRead(admin, body))
      return
    }
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
