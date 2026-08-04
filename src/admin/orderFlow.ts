import type { OrderFlowCard, OrderFlowStage } from './contracts'

export const orderFlowStageMeta: Record<OrderFlowStage, { index: string; label: string; tone: string }> = {
  new: { index: '01', label: 'New', tone: 'blue' },
  interest: { index: '02', label: 'Interest', tone: 'coral' },
  awaiting_payment: { index: '03', label: 'Awaiting payment', tone: 'violet' },
  paid_to_ship: { index: '04', label: 'Paid · to ship', tone: 'green' },
  shipped: { index: '05', label: 'Shipped', tone: 'teal' },
}

export type BoardPrimaryAction = 'Process' | 'Send invite' | 'Ship' | 'Close'

export function activeBoardStage(stage: string): OrderFlowStage | 'closed' {
  return stage === 'ready_to_invite' ? 'interest' : stage as OrderFlowStage | 'closed'
}

export function primaryAction(card: OrderFlowCard): BoardPrimaryAction | null {
  const stage = activeBoardStage(String(card.stage))
  if (stage === 'new') return 'Process'
  if (stage === 'interest') return 'Send invite'
  if (stage === 'paid_to_ship') return 'Ship'
  if (stage === 'shipped' && card.delivery_confirmed_at) return 'Close'
  return null
}

export function relativeTime(value: string, now = Date.now()) {
  const timestamp = new Date(value).valueOf()
  if (!Number.isFinite(timestamp)) return 'Received recently'
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000))
  if (minutes < 1) return 'Received just now'
  if (minutes < 60) return `Received ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Received ${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `Received ${days} day${days === 1 ? '' : 's'} ago`
}

export function shortDate(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return null
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(date)
}

export function cardStatusLine(card: OrderFlowCard, now = Date.now()) {
  const stage = activeBoardStage(String(card.stage))
  if (stage === 'new') return relativeTime(card.created_at, now)
  if (stage === 'interest') {
    if (card.invitation_delivery_status === 'failed') return 'Invitation failed · retry safely'
    if (card.invitation_delivery_status === 'suppressed') return 'Invitation suppressed · retry when delivery is available'
    if (card.invitation_delivery_status === 'pending') return 'Invitation delivery pending · refresh before retry'
    if (card.invitation_status === 'expired') return 'Invitation expired · send a new invitation'
    return 'Interest registered'
  }
  if (stage === 'awaiting_payment') {
    const expiry = shortDate(card.invitation_expires_at)
    if (card.payment_status && ['failed', 'expired', 'canceled', 'unknown'].includes(card.payment_status)) return `Payment ${card.payment_status} · needs attention`
    return expiry ? `Invitation sent · expires ${expiry}` : `Payment ${card.payment_status ?? 'pending'} · updates automatically`
  }
  if (stage === 'paid_to_ship') return `Paid · ${card.fulfilment_status?.replaceAll('_', ' ') ?? 'address confirmed'}`
  if (stage === 'shipped') {
    if (card.delivery_confirmed_at) return 'Delivery confirmed · ready to close'
    if (card.tracking_number) return 'Shipped · tracking available'
    return 'Shipped · awaiting delivery confirmation'
  }
  return 'Closed · archived'
}

export function thresholdStatusLine(card: OrderFlowCard) {
  if (activeBoardStage(String(card.stage)) !== 'interest') return null
  if (card.production_threshold === null) return 'Threshold not configured'
  const interested = Number(card.qualified_units ?? 0)
  const threshold = card.production_threshold
  if (card.threshold_reached) return `${interested} / ${threshold} interested · Threshold reached`
  const needed = Number(card.units_needed ?? Math.max(threshold - interested, 0))
  return `${interested} / ${threshold} interested · ${needed} more needed`
}

export function previewPayloadForCard(card: OrderFlowCard, action: BoardPrimaryAction | 'Confirm delivery') {
  if (action === 'Process') return { action: 'board.process.preview', sourceType: card.source_type, sourceId: card.source_id, expectedVersion: card.board_version }
  if (action === 'Send invite') return { action: 'invitation.preview', reservationId: card.source_id }
  if (action === 'Confirm delivery') return { action: 'delivery.confirm.preview', sourceId: card.source_id, orderId: card.order_id, expectedVersion: card.board_version }
  if (action === 'Close') return { action: 'board.close.preview', sourceId: card.source_id, orderId: card.order_id, expectedVersion: card.board_version }
  return null
}

export function cardsByStage(cards: OrderFlowCard[]) {
  return Object.fromEntries(Object.keys(orderFlowStageMeta).map((stage) => [stage, cards.filter((card) => activeBoardStage(String(card.stage)) === stage)])) as Record<OrderFlowStage, OrderFlowCard[]>
}
