import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { AlertTriangle, Archive, ArrowRight, CheckCircle, Clock, Eye, Hourglass, Lock, Mail, Package, Search, Truck } from 'lucide-react'
import { getOrderFlow, runAdminAction, type AdminActionResult } from './api'
import { orderFlowStages, type AdminRole, type OrderFlowCard, type OrderFlowDrop, type OrderFlowStage } from './contracts'
import { cardsByStage, cardStatusLine, orderFlowStageMeta, previewPayloadForCard, primaryAction, type BoardPrimaryAction } from './orderFlow'
import { getDropBySlug } from '../data/drops'

type BoardFilters = { search: string; drop_slug: string; source_type: string; stage: string; needs_attention: string; include_closed: string }
type PendingAction = {
  card: OrderFlowCard | null
  label: BoardPrimaryAction | 'Confirm delivery'
  request: Record<string, unknown>
  preview: AdminActionResult
}

const emptyFilters: BoardFilters = { search: '', drop_slug: '', source_type: '', stage: '', needs_attention: '', include_closed: '' }
const pageSize = 100

const stageIcons: Record<OrderFlowStage, typeof Clock> = {
  new: Clock,
  interest: Eye,
  ready_to_invite: Mail,
  awaiting_payment: Hourglass,
  paid_to_ship: Package,
  shipped: Truck,
}

export function OrderFlowBoard({ token, role, onDetails, refreshSignal = 0 }: { token: string; role: AdminRole; onDetails: (card: OrderFlowCard) => void; refreshSignal?: number }) {
  const [filters, setFilters] = useState<BoardFilters>(emptyFilters)
  const [offset, setOffset] = useState(0)
  const [cards, setCards] = useState<OrderFlowCard[]>([])
  const [drops, setDrops] = useState<OrderFlowDrop[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionLoading, setActionLoading] = useState('')
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    let alive = true
    const timer = window.setTimeout(() => {
      setLoading(true); setError('')
      const activeFilters = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
      void getOrderFlow(token, pageSize, offset, activeFilters)
        .then((response) => {
          if (!alive) return
          setCards(response.items); setDrops(response.drops); setTotal(response.page.total); setLoading(false)
        })
        .catch((reason: unknown) => {
          if (!alive) return
          setError(reason instanceof Error ? reason.message : 'The order flow could not be loaded.'); setLoading(false)
        })
    }, filters.search ? 250 : 0)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [filters, offset, refreshKey, refreshSignal, token])

  const columns = useMemo(() => cardsByStage(cards.filter((card) => card.stage !== 'closed')), [cards])
  const archiveCards = useMemo(() => cards.filter((card) => card.stage === 'closed'), [cards])
  const updateFilter = (name: keyof BoardFilters, value: string) => { setOffset(0); setFilters((current) => ({ ...current, [name]: value })) }
  const refresh = () => setRefreshKey((value) => value + 1)

  const beginAction = async (card: OrderFlowCard, label: BoardPrimaryAction | 'Confirm delivery') => {
    const request = previewPayloadForCard(card, label)
    if (!request) { onDetails(card); return }
    setActionLoading(card.source_id); setActionError('')
    try {
      const preview = await runAdminAction(token, request)
      setPending({ card, label, request, preview })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'The action preview could not be loaded.')
    } finally { setActionLoading('') }
  }

  const openDrop = async (drop: OrderFlowDrop) => {
    setActionLoading(drop.product_code); setActionError('')
    try {
      const request = { action: 'drop.open.preview', productCode: drop.product_code, expectedUpdatedAt: drop.updated_at }
      const preview = await runAdminAction(token, request)
      setPending({ card: null, label: 'Send', request, preview })
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : 'The drop preview could not be loaded.')
    } finally { setActionLoading('') }
  }

  return <section className="order-flow" aria-labelledby="order-flow-title">
    <header className="order-flow-heading"><div><p className="admin-kicker">Guided operations</p><h1 id="order-flow-title">Order flow</h1><p>One-way progression from new interest to delivered archive. Cards never move by drag and drop.</p></div><div className="order-flow-legend"><Lock aria-hidden="true" size={16} /><span>Server-locked flow</span><ArrowRight aria-hidden="true" size={18} /><span>Explicit actions</span></div></header>

    <div className="order-flow-filters" aria-label="Order flow filters">
      <label className="order-flow-search"><Search aria-hidden="true" size={18} /><span className="sr-only">Search</span><input value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} placeholder="Search customer, reference or poster" /></label>
      <label><span>Drop</span><select value={filters.drop_slug} onChange={(event) => updateFilter('drop_slug', event.target.value)}><option value="">All drops</option>{drops.map((drop) => <option key={drop.product_code} value={drop.drop_slug}>{drop.drop_title}</option>)}</select></label>
      <label><span>Card type</span><select value={filters.source_type} onChange={(event) => updateFilter('source_type', event.target.value)}><option value="">All types</option><option value="drop">Drop</option><option value="shop_order">Shop order</option></select></label>
      <label><span>Phase</span><select value={filters.stage} onChange={(event) => updateFilter('stage', event.target.value)}><option value="">All phases</option>{orderFlowStages.map((stage) => <option key={stage} value={stage}>{orderFlowStageMeta[stage].label}</option>)}<option value="closed">Closed</option></select></label>
      <button type="button" className={filters.needs_attention ? 'is-active' : ''} aria-pressed={Boolean(filters.needs_attention)} onClick={() => updateFilter('needs_attention', filters.needs_attention ? '' : 'true')}><AlertTriangle aria-hidden="true" size={17} />Needs attention</button>
      <button type="button" className={filters.include_closed ? 'is-active' : ''} aria-pressed={Boolean(filters.include_closed)} onClick={() => { updateFilter('include_closed', filters.include_closed ? '' : 'true'); updateFilter('stage', filters.include_closed ? '' : 'closed') }}><Archive aria-hidden="true" size={17} />Closed</button>
    </div>

    {drops.length > 0 && <section className="drop-overview" aria-labelledby="drop-overview-title"><div className="drop-overview-title"><Hourglass aria-hidden="true" size={22} /><div><p className="admin-kicker">Production gates</p><h2 id="drop-overview-title">Drop overview</h2></div></div><div className="drop-overview-list">{drops.map((drop) => <DropSummary key={drop.product_code} drop={drop} role={role} busy={actionLoading === drop.product_code} onFilter={() => updateFilter('drop_slug', drop.drop_slug)} onOpen={() => void openDrop(drop)} />)}</div></section>}

    {actionError && <p className="admin-message admin-error" role="alert">{actionError}</p>}
    {loading ? <p className="admin-state" role="status">Loading the controlled order flow…</p> : error ? <div><p className="admin-state admin-error" role="alert">{error}</p><button type="button" onClick={refresh}>Retry board</button></div> : filters.stage === 'closed' || filters.include_closed && archiveCards.length ? <ArchiveGrid cards={archiveCards} onDetails={onDetails} /> : <div className="order-flow-scroll" tabIndex={0} aria-label="Order flow columns"><div className="order-flow-board">{orderFlowStages.map((stage) => <BoardColumn key={stage} stage={stage} cards={columns[stage]} role={role} busyId={actionLoading} onAction={(card, action) => void beginAction(card, action)} onDetails={onDetails} />)}</div></div>}

    {!loading && !error && cards.length === 0 && <p className="order-flow-empty">No cards match these filters. Closed items remain available through the archive filter.</p>}
    {!loading && total > pageSize && <nav className="admin-pagination" aria-label="Order flow pages"><span>{offset + 1}–{Math.min(offset + pageSize, total)} of {total}</span><div><button type="button" onClick={() => setOffset(Math.max(0, offset - pageSize))} disabled={offset === 0}>Previous</button><button type="button" onClick={() => setOffset(offset + pageSize)} disabled={offset + pageSize >= total}>Next</button></div></nav>}
    {pending && <ActionConfirmation pending={pending} token={token} onCancel={() => setPending(null)} onComplete={() => { setPending(null); refresh() }} />}
  </section>
}

function DropSummary({ drop, role, busy, onFilter, onOpen }: { drop: OrderFlowDrop; role: AdminRole; busy: boolean; onFilter: () => void; onOpen: () => void }) {
  const configured = drop.production_threshold !== null
  const ready = configured && drop.threshold_reached
  const open = drop.lifecycle_mode === 'preorder'
  return <article className={`drop-summary ${open || ready ? 'ready' : 'pending'}`}><button type="button" className="drop-summary-main" onClick={onFilter}><span className="drop-summary-icon">{open || ready ? <CheckCircle aria-hidden="true" /> : <Hourglass aria-hidden="true" />}</span><span><strong>{drop.drop_title}</strong><small>{open ? 'Invitations open' : ready ? 'Production threshold reached — ready to move forward' : configured ? `Pending drop · ${drop.units_needed} more needed` : 'Pending drop · threshold not configured'}</small></span><span className="drop-summary-progress">{configured ? <><strong>{drop.qualified_units} / {drop.production_threshold}</strong><small>qualified units</small></> : <><strong>{drop.qualified_units}</strong><small>qualified units</small></>}</span></button>{ready && !open && <button type="button" className="drop-open-button" onClick={onOpen} disabled={role !== 'manager' || busy}>{busy ? 'Reviewing…' : 'Open invitations'}</button>}</article>
}

function BoardColumn({ stage, cards, role, busyId, onAction, onDetails }: { stage: OrderFlowStage; cards: OrderFlowCard[]; role: AdminRole; busyId: string; onAction: (card: OrderFlowCard, action: BoardPrimaryAction) => void; onDetails: (card: OrderFlowCard) => void }) {
  const meta = orderFlowStageMeta[stage]
  const Icon = stageIcons[stage]
  return <section className={`order-flow-column tone-${meta.tone}`} aria-labelledby={`flow-${stage}`}><header><span className="order-flow-step">{meta.index}</span><Icon aria-hidden="true" size={18} /><h2 id={`flow-${stage}`}>{meta.label}</h2><strong>{cards.length}</strong><Lock aria-label="Locked progression" size={15} /></header><div className="order-flow-cards">{cards.map((card) => <OrderFlowCardView key={card.source_id} card={card} role={role} busy={busyId === card.source_id} onAction={onAction} onDetails={onDetails} />)}{cards.length === 0 && <p className="order-flow-column-empty">No items in this phase.</p>}</div></section>
}

function OrderFlowCardView({ card, role, busy, onAction, onDetails }: { card: OrderFlowCard; role: AdminRole; busy: boolean; onAction: (card: OrderFlowCard, action: BoardPrimaryAction) => void; onDetails: (card: OrderFlowCard) => void }) {
  const action = primaryAction(card)
  const restricted = action === 'Send' || action === 'Close' ? role !== 'manager' : false
  const poster = getDropBySlug(card.drop_slug)
  return <article className={`order-flow-card ${card.needs_attention ? 'needs-attention' : ''}`}><div className="order-flow-card-top"><div className="order-flow-thumb">{poster?.image ? <img src={poster.image} alt="" /> : <Package aria-hidden="true" />}</div><div><div className="order-flow-badges"><span>{card.source_type === 'drop' ? 'Drop' : 'Shop order'}</span>{card.record_origin !== 'customer' && <span className="is-origin">{card.record_origin.replaceAll('_', ' ')}</span>}{card.needs_attention && <span className="is-attention"><AlertTriangle aria-hidden="true" size={13} />Attention</span>}</div><h3>{card.customer_name}</h3><p>{card.drop_title} · {card.preferred_format} · ×{card.quantity}</p><small>{card.reference_number} · {card.country_code ?? 'Country pending'}</small></div></div><p className="order-flow-status">{cardStatusLine(card)}</p><div className="order-flow-card-actions">{action && <button type="button" className="order-flow-primary" onClick={() => action === 'Ship' ? onDetails(card) : onAction(card, action)} disabled={busy || restricted}>{busy ? 'Reviewing…' : action}<ArrowRight aria-hidden="true" size={17} /></button>}<button type="button" className="order-flow-details" onClick={() => onDetails(card)}>Details</button></div>{restricted && <p className="order-flow-role-note">Manager confirmation required.</p>}</article>
}

function ArchiveGrid({ cards, onDetails }: { cards: OrderFlowCard[]; onDetails: (card: OrderFlowCard) => void }) {
  return <section className="order-flow-archive" aria-labelledby="archive-title"><div><p className="admin-kicker">Searchable history</p><h2 id="archive-title">Closed orders</h2></div><div className="order-flow-archive-grid">{cards.map((card) => <article key={card.source_id}><Archive aria-hidden="true" /><div><h3>{card.customer_name}</h3><p>{card.drop_title} · {card.reference_number}</p><small>Closed · lifecycle snapshot preserved</small></div><button type="button" onClick={() => onDetails(card)}>Details</button></article>)}</div></section>
}

function ActionConfirmation({ pending, token, onCancel, onComplete }: { pending: PendingAction; token: string; onCancel: () => void; onComplete: () => void }) {
  const dialog = useRef<HTMLElement>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const confirmation = pending.preview.confirmation
  const isDropOpen = confirmation?.action === 'drop.open'
  const title = pending.label === 'Send' && !isDropOpen ? 'Send payment invitation?' : isDropOpen ? 'Open invitations for this drop?' : pending.label === 'Process' ? 'Process this item?' : pending.label === 'Close' ? 'Close delivered order?' : 'Confirm delivery?'
  useEffect(() => { dialog.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!confirmation || submitting) return
    setSubmitting(true); setError('')
    try {
      const { action: _previewAction, ...request } = pending.request
      await runAdminAction(token, { ...request, action: confirmation.action, idempotencyKey: crypto.randomUUID(), confirmationProof: confirmation.proof })
      onComplete()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The confirmed action could not be completed.'); setSubmitting(false) }
  }
  const card = pending.card
  const preview = pending.preview.preview ?? {}
  return <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => { if (!submitting) onCancel() }}><section ref={dialog} className="admin-dialog order-flow-confirm" role="dialog" aria-modal="true" aria-labelledby="order-flow-confirm-title" onMouseDown={(event) => event.stopPropagation()}><p className="admin-kicker">Explicit confirmation</p><h2 id="order-flow-confirm-title">{title}</h2><dl>{isDropOpen ? <><div><dt>Drop</dt><dd>{String(preview.dropTitle ?? preview.dropSlug ?? 'Selected drop')}</dd></div><div><dt>Threshold</dt><dd>{String(preview.qualifiedUnits ?? '—')} / {String(preview.productionThreshold ?? '—')} qualified units</dd></div></> : card ? <><div><dt>Customer</dt><dd>{card.customer_name} · {card.masked_email}</dd></div><div><dt>Poster / drop</dt><dd>{card.drop_title} · {card.preferred_format} · ×{card.quantity}</dd></div>{pending.label === 'Send' && <><div><dt>Poster amount</dt><dd>{card.subtotal_amount !== null ? `${card.currency ?? 'EUR'} ${Number(card.subtotal_amount).toFixed(2)}` : 'Calculated from the server-owned drop price'}</dd></div><div><dt>Shipping</dt><dd>{card.shipping_amount !== null ? `${card.currency ?? 'EUR'} ${Number(card.shipping_amount).toFixed(2)}` : 'Calculated securely from the customer destination before payment'}</dd></div><div><dt>Expires</dt><dd>{card.invitation_expires_at ? new Date(card.invitation_expires_at).toLocaleDateString('en-GB') : 'Seven days after sending'}</dd></div></>}</> : null}<div><dt>Effect</dt><dd>{String(confirmation?.summary.externalEffect ?? 'Updates the controlled Admin workflow.')}</dd></div><div><dt>Safety</dt><dd>{String(confirmation?.summary.reversibility ?? 'The action is recorded in audit history.')}</dd></div></dl>{error && <p className="admin-message admin-error" role="alert">{error}</p>}<form onSubmit={submit}><div className="admin-action-buttons"><button type="button" className="admin-secondary" onClick={onCancel} disabled={submitting}>Cancel</button><button type="submit" disabled={!confirmation || submitting}>{submitting ? 'Working…' : isDropOpen ? 'Open invitations' : pending.label === 'Confirm delivery' ? 'Confirm delivery' : pending.label}</button></div></form></section></div>
}

export function OrderFlowDetailActions({ card, token, role, onChanged }: { card: OrderFlowCard; token: string; role: AdminRole; onChanged: () => void }) {
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [error, setError] = useState('')
  if (card.stage !== 'shipped' || card.delivery_confirmed_at || card.closed_at) return null
  if (role !== 'manager') return <p className="admin-muted">Only a manager can record delivery confirmation before closing this order.</p>
  const preview = async () => {
    const request = previewPayloadForCard(card, 'Confirm delivery')
    if (!request) return
    setError('')
    try { setPending({ card, label: 'Confirm delivery', request, preview: await runAdminAction(token, request) }) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Delivery confirmation could not be reviewed.') }
  }
  return <section className="order-flow-detail-action" aria-labelledby="delivery-confirm-title"><h4 id="delivery-confirm-title">Delivery confirmation</h4><p>Use this only after delivery has been verified. It does not contact the carrier or customer.</p><button type="button" onClick={() => void preview()}>Review delivery confirmation</button>{error && <p className="admin-message admin-error" role="alert">{error}</p>}{pending && <ActionConfirmation pending={pending} token={token} onCancel={() => setPending(null)} onComplete={() => { setPending(null); onChanged() }} />}</section>
}
