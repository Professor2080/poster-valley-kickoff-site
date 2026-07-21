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
