export const adminResources = ['reservations', 'invitations', 'orders', 'payments', 'events', 'products'] as const
export type AdminResource = (typeof adminResources)[number]
export type AdminRole = 'operator' | 'manager'

export const resourceFilters: Record<AdminResource, string[]> = {
  reservations: ['status', 'reservation_status'],
  invitations: ['status'],
  orders: ['status'],
  payments: ['status'],
  events: ['entity_type', 'entity_id'],
  products: ['lifecycle_mode', 'commerce_authority'],
}

export type AdminPage = { limit: number; offset: number; total: number }
export type AdminReadResponse = { version: 'v1'; resource: AdminResource; items: Record<string, unknown>[]; page: AdminPage }

export function boundedOffset(offset: number, limit: number, total: number, direction: 'next' | 'previous') {
  if (direction === 'previous') return Math.max(0, offset - limit)
  return offset + limit < total ? offset + limit : offset
}

export function adminReadUrl(resource: AdminResource, limit: number, offset: number, filters: Record<string, string>) {
  const params = new URLSearchParams({ resource, limit: String(limit), offset: String(offset) })
  for (const name of resourceFilters[resource]) if (filters[name]) params.set(name, filters[name])
  return `/api/admin/read?${params.toString()}`
}
