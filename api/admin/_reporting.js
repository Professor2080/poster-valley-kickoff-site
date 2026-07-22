import { AdminRequestError } from '../_admin.js'
import { actionRequestHash, issueConfirmationProof, previewFingerprint, verifyConfirmationProof } from './_actions.js'

const presets = new Map([['7d', 7], ['30d', 30], ['90d', 90]])
const exportTypes = new Set(['reservations', 'invitations', 'orders', 'payments', 'fulfilment', 'summary'])
const orderStatuses = new Set(['draft', 'awaiting_payment', 'payment_open', 'paid', 'payment_failed', 'payment_expired', 'cancelled', 'shipped'])
const fulfilmentStatuses = new Set(['unfulfilled', 'ready_to_pack', 'packed', 'shipped'])
const deliveryStatuses = new Set(['pending', 'failed', 'suppressed', 'sent'])
const dayPattern = /^\d{4}-\d{2}-\d{2}$/

export const exportColumns = {
  reservations: ['reservation_id', 'created_at', 'design_slug', 'design_title', 'preferred_format', 'quantity', 'contact_country_code', 'reservation_status', 'record_origin'],
  invitations: ['invitation_id', 'reservation_id', 'created_at', 'sent_at', 'design_slug', 'design_title', 'quantity', 'currency', 'unit_price', 'subtotal_amount', 'invitation_status', 'expires_at', 'delivery_status', 'delivery_completed_at', 'record_origin'],
  orders: ['order_id', 'invitation_id', 'reservation_id', 'created_at', 'design_slug', 'design_title', 'order_status', 'payment_status', 'fulfilment_status', 'quantity', 'currency', 'subtotal_amount', 'shipping_amount', 'total_amount', 'destination_country_code', 'record_origin'],
  payments: ['payment_id', 'order_id', 'created_at', 'provider', 'payment_status', 'amount', 'currency', 'webhook_received_at', 'paid_at', 'record_origin'],
  fulfilment: ['order_id', 'paid_at', 'design_slug', 'design_title', 'order_status', 'fulfilment_status', 'quantity', 'currency', 'total_amount', 'destination_country_code', 'carrier', 'tracking_present', 'shipped_at', 'shipping_email_status', 'record_origin'],
  summary: ['group_type', 'design_slug', 'design_title', 'destination_country_code', 'currency', 'paid_orders', 'paid_gross_revenue'],
}

function invalid(message, code = 'invalid_report_filter') {
  throw new AdminRequestError(400, code, message)
}

function nullableText(value, label, maxLength, pattern = null) {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') invalid(`${label} is invalid.`)
  const result = value.trim()
  if (!result || result.length > maxLength || (pattern && !pattern.test(result))) invalid(`${label} is invalid.`)
  return result
}

function parseUtcDay(value, label) {
  if (typeof value !== 'string' || !dayPattern.test(value)) invalid(`${label} must use YYYY-MM-DD.`, 'invalid_report_period')
  const result = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(result.valueOf()) || result.toISOString().slice(0, 10) !== value) invalid(`${label} is invalid.`, 'invalid_report_period')
  return result
}

export function normalizeReportRequest(body, { now = new Date() } = {}) {
  const preset = typeof body?.preset === 'string' ? body.preset : '30d'
  let from = null
  let to = now.toISOString()

  if (presets.has(preset)) from = new Date(now.valueOf() - presets.get(preset) * 86400000).toISOString()
  else if (preset === 'all') from = null
  else if (preset === 'custom') {
    const start = parseUtcDay(body.from, 'Start date')
    const inclusiveEnd = parseUtcDay(body.to, 'End date')
    const exclusiveEnd = new Date(inclusiveEnd.valueOf() + 86400000)
    if (start >= exclusiveEnd || exclusiveEnd.valueOf() - start.valueOf() > 366 * 86400000 || exclusiveEnd.valueOf() > now.valueOf() + 86400000) invalid('The custom period is invalid or longer than 366 days.', 'invalid_report_period')
    from = start.toISOString(); to = exclusiveEnd.toISOString()
  } else invalid('Unknown reporting period.', 'invalid_report_period')

  const filters = body?.filters && typeof body.filters === 'object' && !Array.isArray(body.filters) ? body.filters : {}
  const dropSlug = nullableText(filters.dropSlug, 'Design', 120, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  const destinationCountryCode = nullableText(filters.destinationCountryCode, 'Destination country', 2, /^[A-Za-z]{2}$/)?.toUpperCase() ?? null
  const orderStatus = nullableText(filters.orderStatus, 'Order status', 40)
  const fulfilmentStatus = nullableText(filters.fulfilmentStatus, 'Fulfilment status', 40)
  const deliveryStatus = nullableText(filters.deliveryStatus, 'Delivery status', 40)
  if (orderStatus && !orderStatuses.has(orderStatus)) invalid('Order status is invalid.')
  if (fulfilmentStatus && !fulfilmentStatuses.has(fulfilmentStatus)) invalid('Fulfilment status is invalid.')
  if (deliveryStatus && !deliveryStatuses.has(deliveryStatus)) invalid('Delivery status is invalid.')
  if (filters.includeNonCustomer !== undefined && typeof filters.includeNonCustomer !== 'boolean') invalid('Record origin scope is invalid.')
  return { preset, from, to, filters: { dropSlug, destinationCountryCode, orderStatus, fulfilmentStatus, deliveryStatus, includeNonCustomer: filters.includeNonCustomer === true } }
}

export function normalizeExportRequest(body, options) {
  const type = typeof body?.exportType === 'string' ? body.exportType : ''
  if (!exportTypes.has(type)) invalid('Unknown export type.', 'invalid_export_type')
  const report = normalizeReportRequest(body, options)
  if (body?.exportFrom !== undefined || body?.exportTo !== undefined) {
    if (typeof body.exportFrom !== 'string' || typeof body.exportTo !== 'string') invalid('The confirmed export period is invalid.', 'invalid_export_period')
    const exactFrom = new Date(body.exportFrom)
    const exactTo = new Date(body.exportTo)
    const current = options?.now ?? new Date()
    if (Number.isNaN(exactFrom.valueOf()) || Number.isNaN(exactTo.valueOf()) || exactFrom.toISOString() !== body.exportFrom || exactTo.toISOString() !== body.exportTo || exactFrom >= exactTo || exactTo.valueOf() - exactFrom.valueOf() > 90 * 86400000 || exactTo.valueOf() > current.valueOf() + 86400000) invalid('The confirmed export period is invalid.', 'invalid_export_period')
    report.from = exactFrom.toISOString()
    report.to = exactTo.toISOString()
  }
  if (!report.from) invalid('Exports require an explicit period of no more than 90 days.', 'invalid_export_period')
  if (new Date(report.to).valueOf() - new Date(report.from).valueOf() > 90 * 86400000) invalid('Exports require an explicit period of no more than 90 days.', 'invalid_export_period')
  return { exportType: type, from: report.from, to: report.to, filters: report.filters }
}

export function reportingRpcBody(actorUserId, request) {
  return {
    p_actor: actorUserId,
    p_from: request.from,
    p_to: request.to,
    p_drop_slug: request.filters.dropSlug,
    p_destination_country_code: request.filters.destinationCountryCode,
    p_order_status: request.filters.orderStatus,
    p_fulfilment_status: request.filters.fulfilmentStatus,
    p_delivery_status: request.filters.deliveryStatus,
    p_include_non_customer: request.filters.includeNonCustomer,
  }
}

export function exportRpcBody(actorUserId, request) {
  return { ...reportingRpcBody(actorUserId, request), p_export_type: request.exportType }
}

export function issueExportConfirmation(actorUserId, request, preview) {
  const action = `report.export.${request.exportType}`
  const requestHash = actionRequestHash(action, request)
  return { action, requestHash, ...issueConfirmationProof({ actorUserId, action, requestHash, previewHash: previewFingerprint(preview) }) }
}

export function verifyExportConfirmation(actorUserId, request, proof, currentPreview) {
  const action = `report.export.${request.exportType}`
  const requestHash = actionRequestHash(action, request)
  const verified = verifyConfirmationProof(proof, { actorUserId, action, requestHash })
  if (verified.previewHash !== previewFingerprint(currentPreview)) throw new AdminRequestError(409, 'confirmation_stale', 'The export size changed after preview. Review it again before downloading.')
}

export function neutralizeSpreadsheetFormula(value) {
  if (typeof value !== 'string' || !/^\s*[=+\-@]/.test(value)) return value
  return `'${value}`
}

function csvCell(value) {
  const safe = neutralizeSpreadsheetFormula(value)
  const text = safe === null || safe === undefined ? '' : String(safe)
  return `"${text.replaceAll('"', '""')}"`
}

export function createCsv(exportType, rows) {
  const columns = exportColumns[exportType]
  if (!columns) invalid('Unknown export type.', 'invalid_export_type')
  const lines = [columns.map(csvCell).join(',')]
  for (const row of rows) lines.push(columns.map((column) => csvCell(row?.[column])).join(','))
  return `\uFEFF${lines.join('\r\n')}\r\n`
}

export function exportFilename(exportType, now = new Date()) {
  if (!exportTypes.has(exportType)) invalid('Unknown export type.', 'invalid_export_type')
  return `poster-valley-${exportType}-${now.toISOString().slice(0, 10)}.csv`
}
