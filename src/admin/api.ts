import { adminReadUrl, type AdminReadResponse, type AdminResource } from './contracts'

export class AdminApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function request<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const body = await response.json().catch(() => null) as { error?: { message?: string } } | null
  if (!response.ok) throw new AdminApiError(response.status, body?.error?.message ?? 'The admin service could not complete that request.')
  return body as T
}

export function getAuthorization(token: string) { return request<{ version: 'v1'; role: 'operator' | 'manager' }>('/api/admin/authorization', token) }
export function getAdminRead(resource: AdminResource, token: string, limit: number, offset: number, filters: Record<string, string>) {
  return request<AdminReadResponse>(adminReadUrl(resource, limit, offset, filters), token)
}
