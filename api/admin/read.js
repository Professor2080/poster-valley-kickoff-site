import { AdminRequestError, adminError, adminPage, adminSelect, requireAdmin } from '../_admin.js'
import { ensureGet, sendJson } from '../_supabase.js'

const resources = {
  reservations: ['drop_interest_requests', 'id,created_at,drop_slug,preferred_format,quantity,country_code,status,reservation_status', ['status', 'reservation_status']],
  invitations: ['order_invitations', 'id,interest_request_id,drop_slug,quantity,currency,unit_price,subtotal_amount,status,expires_at,sent_at,created_at,updated_at', ['status', 'interest_request_id']],
  orders: ['orders', 'id,invitation_id,drop_slug,status,fulfilment_status,fulfilment_version,carrier,tracking_number,shipped_at,shipping_email_status,quantity,currency,subtotal_amount,shipping_amount,total_amount,shipping_country_code,created_at,updated_at', ['status', 'fulfilment_status', 'invitation_id']],
  payments: ['payments', 'id,order_id,provider,status,amount,currency,webhook_received_at,paid_at,created_at,updated_at', ['status', 'order_id']],
  quotes: ['manual_shipping_quotes', 'id,invitation_id,country_code,shipping_amount,currency,expires_at,status,approved_by,created_at,updated_at', ['invitation_id', 'status']],
  email_events: ['email_delivery_events', 'id,occurred_at,actor_user_id,entity_type,entity_id,template,template_version,delivery_status,correlation_id', ['entity_type', 'entity_id', 'template', 'delivery_status'], 'occurred_at.desc'],
  audit: ['admin_audit_events', 'id,occurred_at,actor_user_id,action,entity_type,entity_id,correlation_id,idempotency_key', ['entity_type', 'entity_id', 'action'], 'occurred_at.desc'],
  events: ['entity_events', 'id,occurred_at,actor_user_id,source,event_type,entity_type,entity_id,correlation_id', ['entity_type', 'entity_id', 'event_type'], 'occurred_at.desc'],
  products: ['product_registry', 'product_code,title,lifecycle_mode,commerce_authority,woo_product_id,woo_product_url,created_at,updated_at', ['lifecycle_mode', 'commerce_authority']],
}

export default async function handler(req, res) {
  if (!ensureGet(req, res)) return
  try {
    await requireAdmin(req)
    const resource = typeof req.query?.resource === 'string' ? req.query.resource : ''
    const definition = resources[resource]
    if (!definition) throw new AdminRequestError(400, 'invalid_resource', 'Unknown read resource.')
    const [table, select, allowedFilters, order] = definition
    const filters = Object.fromEntries(allowedFilters.map((key) => [key, typeof req.query?.[key] === 'string' ? req.query[key] : null]))
    sendJson(res, 200, { version: 'v1', resource, ...(await adminSelect(table, select, { ...adminPage(req.query), filters, order })) })
  } catch (error) { adminError(res, error) }
}
