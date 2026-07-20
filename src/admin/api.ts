import { adminReadUrl, type AdminReadResponse, type AdminResource } from './contracts'

export class AdminApiError extends Error {
  status: number
  code: string
  constructor(status: number, codeOrMessage: string, message?: string) { super(message ?? codeOrMessage); this.name = 'AdminApiError'; this.status = status; this.code = message ? codeOrMessage : 'admin_request_failed' }
}

type ErrorEnvelope = { error?: { code?: string; message?: string } }

export type AdminActionResult = {
  success: true
  preview?: Record<string, unknown>
  entityId?: string
  emailAttemptId?: string
  deliveryStatus?: 'pending' | 'suppressed' | 'sent' | 'failed' | null
  fulfilmentStatus?: string
  fulfilmentVersion?: number
  quoteId?: string
  replay?: boolean
}

async function request<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  const body = await response.json().catch(() => null) as ErrorEnvelope | null
  if (!response.ok) throw new AdminApiError(response.status, body?.error?.code ?? 'admin_request_failed', body?.error?.message ?? 'The admin service could not complete that request.')
  return body as T
}

async function post<T>(url: string, token: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => null) as ErrorEnvelope | null
  if (!response.ok) throw new AdminApiError(response.status, body?.error?.code ?? 'operation_failed', body?.error?.message ?? 'The operation could not be completed.')
  return body as T
}

export function getAuthorization(token: string) { return request<{ version: 'v1'; role: 'operator' | 'manager' }>('/api/admin/authorization', token) }
export function getAdminRead(resource: AdminResource, token: string, limit: number, offset: number, filters: Record<string, string>) {
  return request<AdminReadResponse>(adminReadUrl(resource, limit, offset, filters), token)
}
export function runAdminAction(token: string, payload: Record<string, unknown>) { return post<AdminActionResult>('/api/admin/actions', token, payload) }
