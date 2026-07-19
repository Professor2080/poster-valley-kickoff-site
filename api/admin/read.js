import { AdminRequestError, adminError, adminPage, adminSelect, requireAdmin } from '../_admin.js'
import { ensureGet, sendJson } from '../_supabase.js'

const resources = {
  reservations: ['drop_interest_requests', 'id,created_at,drop_slug,preferred_format,quantity,country_code,status,reservation_status', ['status', 'reservation_status']],
  invitations: ['order_invitations', 'id,interest_request_id,drop_slug,quantity,currency,unit_price,subtotal_amount,status,expires_at,sent_at,created_at', ['status']],
  orders: ['orders', 'id,invitation_id,drop_slug,status,quantity,currency,subtotal_amount,shipping_amount,total_amount,shipping_country_code,created_at,updated_at', ['status']],
  payments: ['payments', 'id,order_id,provider,status,amount,currency,webhook_received_at,paid_at,created_at,updated_at', ['status']],
  events: ['entity_events', 'id,occurred_at,actor_user_id,source,event_type,entity_type,entity_id,correlation_id', ['entity_type', 'entity_id'], 'occurred_at.desc'],
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
