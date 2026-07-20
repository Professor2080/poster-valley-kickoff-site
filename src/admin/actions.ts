import type { AdminActionResult } from './api'
import type { AdminResource, AdminRole } from './contracts'

export type ContextAction = {
  kind: 'invitation' | 'quote' | 'fulfilment' | 'shipping'
  label: string
  previewAction: 'invitation.preview' | 'quote.preview' | 'fulfilment.preview' | 'shipping.preview'
  mutationAction?: 'invitation.send' | 'invitation.resend' | 'quote.approve' | 'fulfilment.transition' | 'shipping.retry'
  targetStatus?: 'ready_to_pack' | 'packed' | 'shipped'
}

export type ActionAttempt = {
  action: NonNullable<ContextAction['mutationAction']>
  payload: Record<string, unknown>
  preview: Record<string, unknown>
  idempotencyKey: string
}

export type ActionPhase = 'idle' | 'previewing' | 'confirming' | 'submitting' | 'success' | 'conflict' | 'forbidden' | 'failure'

export type HistoryDefinition = { resource: AdminResource; label: string; filters: Record<string, string> }

const text = (item: Record<string, unknown>, field: string) => typeof item[field] === 'string' ? item[field] as string : ''
const number = (item: Record<string, unknown>, field: string) => typeof item[field] === 'number' ? item[field] as number : Number(item[field])

export function contextualActions(resource: AdminResource, item: Record<string, unknown>, role: AdminRole): ContextAction[] {
  if (resource === 'reservations') {
    const status = text(item, 'reservation_status') || text(item, 'status')
    return ['converted', 'cancelled'].includes(status) ? [] : [{ kind: 'invitation', label: 'Review invitation', previewAction: 'invitation.preview' }]
  }
  if (resource === 'invitations') {
    const status = text(item, 'status')
    const expiry = Date.parse(text(item, 'expires_at'))
    const expired = Number.isFinite(expiry) && expiry <= Date.now()
    const actions: ContextAction[] = []
    if (['draft', 'expired'].includes(status)) actions.push({ kind: 'invitation', label: 'Review invitation send', previewAction: 'invitation.preview', mutationAction: 'invitation.send' })
    if (['sent', 'opened'].includes(status)) actions.push({ kind: 'invitation', label: 'Review invitation resend', previewAction: 'invitation.preview', mutationAction: 'invitation.resend' })
    if (role === 'manager' && !expired && ['draft', 'sent', 'opened', 'order_started'].includes(status)) actions.push({ kind: 'quote', label: 'Prepare manual shipping quote', previewAction: 'quote.preview', mutationAction: 'quote.approve' })
    return actions
  }
  if (resource === 'orders' && text(item, 'status') === 'paid') {
    const target = { unfulfilled: 'ready_to_pack', ready_to_pack: 'packed', packed: 'shipped' }[text(item, 'fulfilment_status')] as ContextAction['targetStatus']
    if (target) return [{ kind: 'fulfilment', label: `Review ${target.replaceAll('_', ' ')}`, previewAction: 'fulfilment.preview', mutationAction: 'fulfilment.transition', targetStatus: target }]
    if (text(item, 'fulfilment_status') === 'shipped' && text(item, 'shipping_email_status') !== 'sent') {
      return [{ kind: 'shipping', label: 'Review shipping email retry', previewAction: 'shipping.preview', mutationAction: 'shipping.retry' }]
    }
    return []
  }
  return []
}

export function historyDefinitions(resource: AdminResource, item: Record<string, unknown>): HistoryDefinition[] {
  const id = text(item, 'id')
  if (!id) return []
  if (resource === 'reservations') return [
    { resource: 'invitations', label: 'Invitation history', filters: { interest_request_id: id } },
    { resource: 'audit', label: 'Audit history', filters: { entity_type: 'reservation', entity_id: id } },
    { resource: 'events', label: 'Entity history', filters: { entity_type: 'reservation', entity_id: id } },
  ]
  if (resource === 'invitations') return [
    { resource: 'orders', label: 'Order history', filters: { invitation_id: id } },
    { resource: 'quotes', label: 'Quote history', filters: { invitation_id: id } },
    { resource: 'email_events', label: 'Email history', filters: { entity_type: 'order_invitation', entity_id: id } },
    { resource: 'audit', label: 'Audit history', filters: { entity_type: 'order_invitation', entity_id: id } },
    { resource: 'events', label: 'Entity history', filters: { entity_type: 'order_invitation', entity_id: id } },
  ]
  if (resource === 'orders') return [
    { resource: 'payments', label: 'Payment history', filters: { order_id: id } },
    { resource: 'email_events', label: 'Email history', filters: { entity_type: 'order', entity_id: id } },
    { resource: 'audit', label: 'Audit history', filters: { entity_type: 'order', entity_id: id } },
    { resource: 'events', label: 'Fulfilment and entity history', filters: { entity_type: 'order', entity_id: id } },
  ]
  return []
}

export function createActionAttempt(action: NonNullable<ContextAction['mutationAction']>, payload: Record<string, unknown>, preview: Record<string, unknown>, makeKey = () => crypto.randomUUID()): ActionAttempt {
  return { action, payload, preview, idempotencyKey: makeKey() }
}

export function classifyActionError(error: unknown): 'conflict' | 'forbidden' | 'failure' {
  const candidate = error as { status?: number; code?: string }
  if (candidate.status === 403) return 'forbidden'
  if (candidate.status === 409 || ['idempotency_conflict', 'stale_transition', 'invalid_transition', 'quote_in_use', 'operation_in_progress'].includes(candidate.code ?? '')) return 'conflict'
  return 'failure'
}

export function actionResultMessage(result: AdminActionResult) {
  if (result.deliveryStatus === 'pending') return 'Email delivery is already in progress. Refresh history before trying again.'
  if (result.deliveryStatus === 'suppressed') return 'The action completed and customer email was safely suppressed.'
  if (result.deliveryStatus === 'failed') return 'The record was preserved, but email delivery failed. Start a new preview to retry safely.'
  if (result.deliveryStatus === 'sent') return 'The action completed and the provider confirmed email delivery.'
  if (result.fulfilmentStatus) return `Fulfilment moved to ${result.fulfilmentStatus.replaceAll('_', ' ')}.`
  if (result.quoteId) return 'The manual shipping quote was approved.'
  return result.replay ? 'The earlier completed result was replayed safely.' : 'The action completed.'
}

export function completionPhase(result: AdminActionResult): ActionPhase {
  if (result.deliveryStatus === 'pending') return 'conflict'
  if (result.deliveryStatus === 'failed') return 'failure'
  return 'success'
}

export function actionInputsDisabled(phase: ActionPhase, attempt: ActionAttempt | null) {
  return phase !== 'idle' || attempt !== null
}

export function recordContext(item: Record<string, unknown>) {
  return text(item, 'id') || text(item, 'product_code') || 'record'
}

export function fulfilmentVersion(item: Record<string, unknown>) {
  const value = number(item, 'fulfilment_version')
  return Number.isSafeInteger(value) && value >= 0 ? value : 0
}
