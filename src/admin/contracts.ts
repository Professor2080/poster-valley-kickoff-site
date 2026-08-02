export const adminResources = ['reservations', 'invitations', 'orders', 'payments', 'quotes', 'email_events', 'audit', 'events', 'products'] as const
export type AdminResource = (typeof adminResources)[number]
export type AdminRole = 'operator' | 'manager'

export const resourceFilters: Record<AdminResource, string[]> = {
  reservations: ['status', 'reservation_status', 'record_origin', 'exclude_origin'],
  invitations: ['status', 'interest_request_id', 'record_origin', 'exclude_origin'],
  orders: ['status', 'payment_status', 'fulfilment_status', 'invitation_id', 'record_origin', 'exclude_origin'],
  payments: ['status', 'order_id', 'record_origin', 'exclude_origin'],
  quotes: ['invitation_id', 'status'],
  email_events: ['entity_type', 'entity_id', 'template', 'delivery_status'],
  audit: ['entity_type', 'entity_id', 'action'],
  events: ['entity_type', 'entity_id', 'event_type'],
  products: ['lifecycle_mode', 'commerce_authority'],
}

export type AdminPage = { limit: number; offset: number; total: number }
export type AdminReadResponse = { version: 'v1'; resource: AdminResource; items: Record<string, unknown>[]; page: AdminPage }
export const orderFlowStages = ['new', 'interest', 'ready_to_invite', 'awaiting_payment', 'paid_to_ship', 'shipped'] as const
export type OrderFlowStage = (typeof orderFlowStages)[number]
export type OrderFlowSource = 'drop' | 'shop_order'
export type OrderFlowCard = Record<string, unknown> & {
  source_id: string
  source_type: OrderFlowSource
  reference_number: string
  stage: OrderFlowStage | 'closed'
  board_version: number
  detail_resource: 'reservations' | 'orders'
  detail_id: string
  customer_name: string
  masked_email: string
  drop_slug: string
  drop_title: string
  preferred_format: string
  quantity: number
  country_code: string | null
  created_at: string
  last_activity_at: string
  needs_attention: boolean
  record_origin: 'customer' | 'test' | 'internal_pilot'
  product_code: string | null
  production_threshold: number | null
  invitation_id: string | null
  invitation_status: string | null
  invitation_sent_at: string | null
  invitation_expires_at: string | null
  invitation_delivery_status: string | null
  order_id: string | null
  order_status: string | null
  payment_status: string | null
  payment_paid_at: string | null
  confirmed_payment_id: string | null
  fulfilment_status: string | null
  fulfilment_version: number | null
  carrier: string | null
  tracking_number: string | null
  shipped_at: string | null
  shipping_email_status: string | null
  shipping_reconciliation_required: boolean | null
  delivery_confirmed_at: string | null
  closed_at: string | null
  subtotal_amount: number | null
  shipping_amount: number | null
  total_amount: number | null
  currency: string | null
}
export type OrderFlowDrop = {
  product_code: string
  drop_slug: string
  drop_title: string
  lifecycle_mode: string
  production_threshold: number | null
  invitations_opened_at: string | null
  updated_at: string
  qualified_units: number
  units_needed: number | null
  threshold_reached: boolean
}
export type OrderFlowResponse = {
  version: 'v1'
  resource: 'order_flow'
  items: OrderFlowCard[]
  drops: OrderFlowDrop[]
  page: AdminPage
}
export type AdminDetailResponse = {
  version: 'v1'
  resource: 'reservations' | 'orders'
  record: Record<string, unknown>
  fulfilment: Record<string, unknown> | null
  history: Record<string, Record<string, unknown>[]>
}

export function boundedOffset(offset: number, limit: number, total: number, direction: 'next' | 'previous') {
  if (direction === 'previous') return Math.max(0, offset - limit)
  return offset + limit < total ? offset + limit : offset
}

export function readViewState({ loading, error, itemCount }: { loading: boolean; error: string; itemCount: number }) {
  if (loading) return 'loading' as const
  if (error) return 'error' as const
  return itemCount === 0 ? 'empty' as const : 'ready' as const
}

export function formatValue(field: string, value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'string' && /_at$/.test(field)) {
    const date = new Date(value)
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleString()
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value).replaceAll('_', ' ')
}
