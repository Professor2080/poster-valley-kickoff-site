import type { AdminDetailResponse, AdminReadResponse, AdminResource } from './contracts'
import type { AdminExportPreview, AdminReportRequest, AdminReportResponse, ExportType } from './reporting'

export class AdminApiError extends Error {
  status: number
  code: string
  constructor(status: number, codeOrMessage: string, message?: string) { super(message ?? codeOrMessage); this.name = 'AdminApiError'; this.status = status; this.code = message ? codeOrMessage : 'admin_request_failed' }
}

type ErrorEnvelope = { error?: { code?: string; message?: string } }

export type AdminActionResult = {
  success: true
  preview?: Record<string, unknown>
  confirmation?: { proof: string; action: string; expiresAt: string; summary: Record<string, unknown> }
  entityId?: string
  emailAttemptId?: string
  deliveryStatus?: 'pending' | 'suppressed' | 'sent' | 'failed' | null
  fulfilmentStatus?: string
  fulfilmentVersion?: number
  quoteId?: string
  recordOrigin?: 'customer' | 'test' | 'internal_pilot'
  recordOriginNeedsReview?: boolean
  recordOriginVersion?: number
  affectedRecords?: Record<string, number>
  replay?: boolean
}

export type DeliveryConfiguration = { mode: 'suppressed' | 'unavailable' | 'live'; ready: boolean; externalEffect: boolean; message: string; missing: string[] }

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

export function getAuthorization(token: string) { return request<{ version: 'v1'; role: 'operator' | 'manager' }>('/api/admin/status?operation=authorization', token) }
export function getAdminRead(resource: AdminResource, token: string, limit: number, offset: number, filters: Record<string, string>) {
  return post<AdminReadResponse>('/api/admin/read', token, { resource, limit, offset, filters })
}
export function getAdminDetail(resource: 'reservations' | 'orders', id: string, token: string) {
  return post<AdminDetailResponse>('/api/admin/detail', token, { resource, id })
}
export function runAdminAction(token: string, payload: Record<string, unknown>) {
  return post<AdminActionResult>('/api/admin/actions', token, payload)
}
export function getDeliveryConfiguration(token: string) { return request<DeliveryConfiguration>('/api/admin/status?operation=delivery', token) }
export function getAdminReport(token: string, payload: AdminReportRequest) {
  return post<AdminReportResponse>('/api/admin/reporting', token, { ...payload, operation: 'report' } as unknown as Record<string, unknown>)
}
export function previewAdminExport(token: string, exportType: ExportType, payload: AdminReportRequest) {
  return post<AdminExportPreview>('/api/admin/reporting', token, { ...payload, exportType, operation: 'export_preview' } as unknown as Record<string, unknown>)
}
export async function downloadAdminExport(token: string, exportType: ExportType, payload: AdminReportRequest, confirmationProof: string, period: { from: string; to: string }) {
  const response = await fetch('/api/admin/reporting', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, exportType, operation: 'export_download', confirmationProof, exportFrom: period.from, exportTo: period.to }) })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ErrorEnvelope | null
    throw new AdminApiError(response.status, body?.error?.code ?? 'export_failed', body?.error?.message ?? 'The export could not be generated.')
  }
  const disposition = response.headers.get('content-disposition') ?? ''
  const filename = disposition.match(/filename="([a-z0-9-]+[.]csv)"/i)?.[1] ?? `poster-valley-${exportType}.csv`
  return { filename, blob: await response.blob(), exportId: response.headers.get('x-poster-valley-export-id') ?? '' }
}
