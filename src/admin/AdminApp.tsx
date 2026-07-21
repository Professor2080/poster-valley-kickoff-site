import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { actionInputsDisabled, actionResultMessage, classifyActionError, completionPhase, contextualActions, createActionAttempt, fulfilmentVersion, historyDefinitions, type ActionPhase, type ContextAction } from './actions'
import { getAdminDetail, getAdminRead, getDeliveryConfiguration, runAdminAction } from './api'
import { adminResources, boundedOffset, formatValue, readViewState, resourceFilters, type AdminDetailResponse, type AdminReadResponse, type AdminResource, type AdminRole } from './contracts'
import { verifyAdminSession } from './session'
import { modalKeyAction } from './dialog'
import { hasBrowserSupabaseConfig, supabase } from './supabase'

const labels: Record<AdminResource | 'overview', string> = {
  overview: 'Overview', reservations: 'Reservations', invitations: 'Invitations', orders: 'Orders', payments: 'Payments',
  quotes: 'Quotes', email_events: 'Email history', audit: 'Audit history', events: 'Events', products: 'Products',
}
const pageSize = 25
const recordOrigins = ['customer', 'test', 'internal_pilot'] as const
const listFields: Partial<Record<AdminResource, string[]>> = {
  reservations: ['customer_name', 'masked_email', 'drop_title', 'reservation_status', 'quantity', 'created_at', 'record_origin', 'record_origin_needs_review'],
  invitations: ['drop_title', 'status', 'delivery_status', 'delivery_completed_at', 'quantity', 'expires_at', 'sent_at', 'record_origin', 'record_origin_needs_review'],
  orders: ['customer_name', 'status', 'payment_status', 'fulfilment_status', 'shipping_country_code', 'created_at', 'record_origin', 'record_origin_needs_review'],
  payments: ['provider', 'status', 'amount', 'currency', 'paid_at', 'created_at', 'record_origin', 'record_origin_needs_review'],
}

type Screen = 'booting' | 'login' | 'email-sent' | 'checking' | 'denied' | 'shell'

export function AdminApp({ callback = false }: { callback?: boolean }) {
  const [screen, setScreen] = useState<Screen>('booting')
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<AdminRole | null>(null)
  const [notice, setNotice] = useState(callback ? 'Completing your secure sign-in…' : '')

  useEffect(() => {
    const client = supabase
    if (!client) { setScreen('login'); return }
    let alive = true
    const verify = async (candidate: Session | null) => {
      if (!alive) return
      if (candidate?.access_token) setScreen('checking')
      const result = await verifyAdminSession(candidate, async () => { await client.auth.signOut() })
      if (!alive) return
      if (result.screen === 'shell') {
        setSession(candidate); setRole(result.role ?? null); setScreen('shell')
        if (callback) window.history.replaceState({}, '', '/admin')
      } else {
        setSession(null); setRole(null); setScreen(result.screen)
        if (result.expired) setNotice('Your session has expired or is no longer valid. Please sign in again.')
      }
    }
    void client.auth.getSession().then(({ data }) => verify(data.session))
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => { void verify(nextSession) })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [callback])

  const logout = async () => { await supabase?.auth.signOut(); setSession(null); setRole(null); setScreen('login'); setNotice('You have been signed out.') }
  if (screen === 'booting' || screen === 'checking') return <AdminStatus title="Checking secure access" message="Verifying your session and access role…" />
  if (screen === 'login' || screen === 'email-sent') return <Login emailSent={screen === 'email-sent'} notice={notice} onSent={() => setScreen('email-sent')} />
  if (screen === 'denied') return <AccessDenied onLogout={logout} />
  return <AdminShell token={session?.access_token ?? ''} role={role ?? 'operator'} onLogout={logout} />
}

function Login({ emailSent, notice, onSent }: { emailSent: boolean; notice: string; onSent: () => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const id = useId()
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!supabase || sending) return
    setSending(true); setError('')
    const { error: signInError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/admin/callback` } })
    setSending(false)
    if (signInError) setError('We could not request a sign-in link. Please try again later.')
    else onSent()
  }
  if (emailSent) return <AdminStatus title="Check your email" message="If this address can sign in, a secure link is on its way. You may close this page after opening the link." />
  return <main className="admin-login"><section className="admin-auth-card" aria-labelledby="admin-login-title"><p className="admin-kicker">Poster Valley / Operations</p><h1 id="admin-login-title">Admin sign in</h1><p>Use your approved work email to request a secure sign-in link.</p>{!hasBrowserSupabaseConfig && <p className="admin-message admin-error" role="alert">Admin sign-in is not configured for this environment.</p>}{notice && <p className="admin-message" role="status">{notice}</p>}<form onSubmit={submit}><label htmlFor={id}>Email address</label><input id={id} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={!hasBrowserSupabaseConfig || sending} /><button type="submit" disabled={!hasBrowserSupabaseConfig || sending}>{sending ? 'Requesting link…' : 'Email me a sign-in link'}</button></form>{error && <p className="admin-message admin-error" role="alert">{error}</p>}<p className="admin-muted">Access is verified by the server after sign-in. This screen does not grant admin access.</p></section></main>
}

function AccessDenied({ onLogout }: { onLogout: () => void }) { return <main className="admin-login"><section className="admin-auth-card" aria-labelledby="access-denied-title"><p className="admin-kicker">Poster Valley / Operations</p><h1 id="access-denied-title">No admin access</h1><p>This signed-in account does not have an active admin role. No operational data has been loaded.</p><button onClick={() => void onLogout()}>Sign out</button></section></main> }
function AdminStatus({ title, message }: { title: string; message: string }) { return <main className="admin-login"><section className="admin-auth-card" aria-live="polite"><p className="admin-kicker">Poster Valley / Operations</p><h1>{title}</h1><p>{message}</p></section></main> }

function AdminShell({ token, role, onLogout }: { token: string; role: AdminRole; onLogout: () => void }) {
  const [section, setSection] = useState<AdminResource | 'overview'>('overview')
  const content = useRef<HTMLElement>(null)
  const selectSection = (item: AdminResource | 'overview') => { setSection(item); requestAnimationFrame(() => content.current?.focus()) }
  return <main className="admin-shell"><a className="admin-skip" href="#admin-content">Skip to content</a><header className="admin-header"><a href="/admin" className="admin-brand">Poster Valley <span>Operations</span></a><div><span className="admin-role">Verified {role}</span><button className="admin-logout" onClick={() => void onLogout()}>Sign out</button></div></header><div className="admin-layout"><nav className="admin-nav" aria-label="Admin sections">{(['overview', ...adminResources] as const).map((item) => <button key={item} aria-current={section === item ? 'page' : undefined} className={section === item ? 'active' : ''} onClick={() => selectSection(item)}>{labels[item]}</button>)}</nav><section ref={content} id="admin-content" className="admin-content" tabIndex={-1}>{section === 'overview' ? <Overview token={token} /> : <ReadList resource={section} token={token} role={role} />}</section></div></main>
}

function Overview({ token }: { token: string }) { return <section aria-labelledby="overview-title"><p className="admin-kicker">Controlled workspace</p><h1 id="overview-title">Overview</h1><p className="admin-intro">Open a reservation, invitation or paid order to review its lifecycle, preview an available action and confirm it explicitly. Payment status cannot be changed here.</p><DeliveryStatus token={token} /><div className="admin-metrics">{(['reservations', 'invitations', 'orders', 'payments'] as const).map((resource) => <Metric key={resource} resource={resource} token={token} />)}</div></section> }
function DeliveryStatus({ token }: { token: string }) { const [status, setStatus] = useState('Checking invitation delivery configuration…'); useEffect(() => { let alive = true; void getDeliveryConfiguration(token).then((value) => alive && setStatus(value.message)).catch(() => alive && setStatus('Invitation delivery status is unavailable.')); return () => { alive = false } }, [token]); return <p className="admin-message" role="status" aria-live="polite"><strong>Invitation email:</strong> {status}</p> }
function Metric({ resource, token }: { resource: AdminResource; token: string }) { const [value, setValue] = useState<string>('…'); useEffect(() => { let alive = true; void getAdminRead(resource, token, 1, 0, { exclude_origin: 'test' }).then((data) => alive && setValue(String(data.page.total))).catch(() => alive && setValue('Unavailable')); return () => { alive = false } }, [resource, token]); return <article className="admin-metric"><p>{labels[resource]}</p><strong>{value}</strong><span>customer + pilot records</span></article> }

function ReadList({ resource, token, role }: { resource: AdminResource; token: string; role: AdminRole }) {
  const [offset, setOffset] = useState(0)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [data, setData] = useState<AdminReadResponse | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [restoreFocusKey, setRestoreFocusKey] = useState('')
  const detailButtons = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => { setOffset(0); setFilters({}); setSelected(null) }, [resource])
  useEffect(() => {
    let alive = true
    setLoading(true); setError('')
    void getAdminRead(resource, token, pageSize, offset, filters)
      .then((response) => { if (alive) { setData(response); setLoading(false) } })
      .catch((reason: unknown) => { if (alive) { setError(reason instanceof Error ? reason.message : 'Unable to load records.'); setLoading(false) } })
    return () => { alive = false }
  }, [resource, token, offset, filters, refreshKey])
  const fields = useMemo(() => data?.items.length ? (listFields[resource] ?? Object.keys(data.items[0])) : [], [data, resource])
  useEffect(() => {
    if (!restoreFocusKey || loading) return
    detailButtons.current.get(restoreFocusKey)?.focus()
    setRestoreFocusKey('')
  }, [data, loading, restoreFocusKey])
  const updateFilter = (name: string, value: string) => { setOffset(0); setFilters((current) => ({ ...current, [name]: value, ...(name === 'record_origin' && value ? { exclude_origin: '' } : {}), ...(name === 'exclude_origin' && value ? { record_origin: '' } : {}) })) }
  const state = readViewState({ loading, error, itemCount: data?.items.length ?? 0 })
  return <section aria-labelledby={`${resource}-title`}>
    <p className="admin-kicker">Operational records</p><h1 id={`${resource}-title`}>{labels[resource]}</h1>
    <div className="admin-filters" aria-label={`${labels[resource]} filters`}>{resourceFilters[resource].map((filter) => <FilterControl key={filter} name={filter} value={filters[filter] ?? ''} onChange={(value) => updateFilter(filter, value)} />)}</div>
    {state === 'loading' ? <p className="admin-state" role="status">Loading {labels[resource].toLowerCase()}…</p> : state === 'error' ? <div><p className="admin-state admin-error" role="alert">{error}</p><button type="button" onClick={() => setRefreshKey((value) => value + 1)}>Retry records</button></div> : state === 'empty' ? <p className="admin-state">No matching {labels[resource].toLowerCase()} were found.</p> : <>
      <div className="admin-table-wrap"><table><caption className="sr-only">{labels[resource]} records</caption><thead><tr>{fields.map((field) => <th key={field}>{field.replaceAll('_', ' ')}</th>)}<th><span className="sr-only">Details</span></th></tr></thead><tbody>{data!.items.map((item, index) => { const recordKey = String(item.id ?? item.product_code ?? index); return <tr key={recordKey}>{fields.map((field) => <td key={field}>{field === 'record_origin' ? <OriginBadge origin={String(item[field] ?? 'customer')} /> : field === 'record_origin_needs_review' ? (item[field] ? <span className="admin-origin-badge needs-review">Needs review</span> : '—') : formatValue(field, item[field])}</td>)}<td><button ref={(node) => { if (node) detailButtons.current.set(recordKey, node); else detailButtons.current.delete(recordKey) }} className="admin-detail-button" onClick={() => setSelected(item)}>View<span className="sr-only"> {labels[resource].toLowerCase()} record {String(item.customer_name ?? item.drop_title ?? item.id ?? index)} details</span></button></td></tr> })}</tbody></table></div>
      <Pagination page={data!.page} onPrevious={() => setOffset(boundedOffset(offset, pageSize, data!.page.total, 'previous'))} onNext={() => setOffset(boundedOffset(offset, pageSize, data!.page.total, 'next'))} />
    </>}
    {selected && <Detail item={selected} resource={resource} token={token} role={role} onChanged={() => setRefreshKey((value) => value + 1)} onClose={() => { setRestoreFocusKey(String(selected.id ?? selected.product_code ?? '')); setSelected(null) }} />}
  </section>
}

function FilterControl({ name, value, onChange }: { name: string; value: string; onChange: (value: string) => void }) {
  if (name === 'record_origin' || name === 'exclude_origin') {
    return <label>{name === 'record_origin' ? 'Origin' : 'Exclude origin'}<select value={value} onChange={(event) => onChange(event.target.value)}><option value="">{name === 'record_origin' ? 'All origins' : 'Exclude none'}</option>{recordOrigins.map((origin) => <option key={origin} value={origin}>{origin.replaceAll('_', ' ')}</option>)}{name === 'exclude_origin' && <option value="test,internal_pilot">Test and internal pilot</option>}</select></label>
  }
  return <label>{name.replaceAll('_', ' ')}<input value={value} onChange={(event) => onChange(event.target.value)} placeholder="Exact value" /></label>
}

function OriginBadge({ origin }: { origin: string }) {
  return <span className={`admin-origin-badge ${origin.replaceAll('_', '-')}`}>{origin.replaceAll('_', ' ')}</span>
}

function Pagination({ page, onPrevious, onNext }: { page: { limit: number; offset: number; total: number }; onPrevious: () => void; onNext: () => void }) { const start = page.total ? page.offset + 1 : 0; const end = Math.min(page.offset + page.limit, page.total); return <nav className="admin-pagination" aria-label="Pagination"><span>{start}–{end} of {page.total}</span><div><button onClick={onPrevious} disabled={page.offset === 0}>Previous</button><button onClick={onNext} disabled={page.offset + page.limit >= page.total}>Next</button></div></nav> }

function Detail({ item, resource, token, role, onChanged, onClose }: { item: Record<string, unknown>; resource: AdminResource; token: string; role: AdminRole; onChanged: () => void; onClose: () => void }) {
  const dialog = useRef<HTMLElement>(null)
  const titleId = useId()
  const [detail, setDetail] = useState<AdminDetailResponse | null>(null)
  const [detailError, setDetailError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailKey, setDetailKey] = useState(0)
  const [mutationBusy, setMutationBusy] = useState(false)
  const canLoadPersonalDetail = role === 'manager' && (resource === 'reservations' || resource === 'orders')
  useEffect(() => {
    let alive = true
    if (!canLoadPersonalDetail || typeof item.id !== 'string') { setDetail(null); return }
    setDetailLoading(true); setDetailError('')
    void getAdminDetail(resource as 'reservations' | 'orders', item.id, token)
      .then((result) => { if (alive) { setDetail(result); setDetailLoading(false) } })
      .catch((reason: unknown) => { if (alive) { setDetailError(reason instanceof Error ? reason.message : 'Personal detail could not be loaded.'); setDetailLoading(false) } })
    return () => { alive = false }
  }, [canLoadPersonalDetail, item.id, resource, token, detailKey])
  const currentItem = detail?.record ?? item
  const actions = useMemo(() => contextualActions(resource, currentItem, role), [resource, currentItem, role])
  useEffect(() => {
    const focusDialog = () => dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    focusDialog()
    const onKeyDown = (event: KeyboardEvent) => {
      const focusable = dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusable?.length) return
      const first = focusable[0]; const last = focusable[focusable.length - 1]
      const action = modalKeyAction({ key: event.key, shiftKey: event.shiftKey, atFirst: document.activeElement === first, atLast: document.activeElement === last })
      if (!action) return
      event.preventDefault()
      if (action === 'close' && !mutationBusy) onClose()
      else if (action === 'first') first.focus()
      else last.focus()
    }
    const keepFocusInDialog = (event: FocusEvent) => { if (dialog.current && event.target instanceof Node && !dialog.current.contains(event.target)) focusDialog() }
    document.addEventListener('keydown', onKeyDown); document.addEventListener('focusin', keepFocusInDialog)
    return () => { document.removeEventListener('keydown', onKeyDown); document.removeEventListener('focusin', keepFocusInDialog) }
  }, [onClose, mutationBusy])
  const changed = () => { onChanged(); setDetailKey((value) => value + 1) }
  return <div className="admin-dialog-backdrop" role="presentation" onMouseDown={() => { if (!mutationBusy) onClose() }}><section ref={dialog} className="admin-dialog admin-record-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={mutationBusy} onMouseDown={(event) => event.stopPropagation()}>
    <div className="admin-dialog-heading"><div><p className="admin-kicker">Contextual record</p><h2 id={titleId}>{labels[resource]} details</h2></div><button onClick={onClose} disabled={mutationBusy}>Close</button></div>
    {detailLoading && <p className="admin-state" role="status">Loading manager-authorized customer detail…</p>}
    {detailError && <div><p className="admin-state admin-error" role="alert">{detailError}</p><button type="button" onClick={() => setDetailKey((value) => value + 1)}>Retry customer detail</button></div>}
    <RecordDetailFields resource={resource} item={currentItem} hasPersonalDetail={Boolean(detail)} fulfilment={detail?.fulfilment ?? null} />
    {role !== 'manager' && (resource === 'reservations' || resource === 'orders') && <p className="admin-muted">Complete customer and shipping details are restricted to managers.</p>}
    <section className="admin-context-actions" aria-labelledby={`${titleId}-actions`}><h3 id={`${titleId}-actions`}>Available actions</h3>{actions.length ? actions.map((action) => <ActionControl key={`${action.kind}-${action.mutationAction ?? action.previewAction}`} action={action} item={currentItem} resource={resource} token={token} onChanged={changed} onBusy={setMutationBusy} />) : <p className="admin-muted">No action is available for your role and this record lifecycle. The server verifies every request.</p>}</section>
    {detail ? <DetailHistory history={detail.history} /> : <HistoryPanel token={token} resource={resource} item={item} refreshKey={detailKey} />}
  </section></div>
}

function RecordDetailFields({ resource, item, hasPersonalDetail, fulfilment }: { resource: AdminResource; item: Record<string, unknown>; hasPersonalDetail: boolean; fulfilment: Record<string, unknown> | null }) {
  if (resource === 'reservations') {
    const fields = hasPersonalDetail ? ['full_name', 'email', 'drop_title', 'preferred_format', 'quantity', 'status', 'reservation_status', 'country', 'created_at', 'record_origin', 'record_origin_needs_review', 'record_origin_version'] : ['customer_name', 'masked_email', 'drop_title', 'preferred_format', 'quantity', 'status', 'reservation_status', 'country_code', 'created_at', 'record_origin', 'record_origin_needs_review', 'record_origin_version']
    return <><DetailList item={item} fields={fields} />{hasPersonalDetail && fulfilment ? <ShippingAddress item={fulfilment} /> : null}</>
  }
  if (resource === 'orders') {
    const summary = <DetailList item={item} fields={['drop_title', 'status', 'payment_status', 'fulfilment_status', 'fulfilment_version', 'shipping_country_code', 'created_at', 'record_origin', 'record_origin_needs_review']} />
    if (!hasPersonalDetail) return summary
    return <>{summary}<section className="admin-customer-detail" aria-labelledby="customer-detail-title"><h3 id="customer-detail-title">Customer</h3><DetailList item={item} fields={['first_name', 'last_name', 'email']} /></section><ShippingAddress item={item} /></>
  }
  return <DetailList item={item} fields={Object.keys(item)} />
}

function DetailList({ item, fields }: { item: Record<string, unknown>; fields: string[] }) {
  return <dl className="admin-record-fields">{fields.filter((field) => field in item).map((field) => <div key={field}><dt>{field.replaceAll('_', ' ')}</dt><dd>{field === 'record_origin' ? <OriginBadge origin={String(item[field])} /> : field === 'record_origin_needs_review' ? (item[field] ? <span className="admin-origin-badge needs-review">Needs review</span> : 'No') : formatValue(field, item[field])}</dd></div>)}</dl>
}

function ShippingAddress({ item }: { item: Record<string, unknown> }) {
  const [copyStatus, setCopyStatus] = useState('')
  const values = ['shipping_name', 'shipping_company', 'address_line1', 'address_line2', 'postal_code', 'city', 'region', 'shipping_country', 'shipping_country_code']
  const copyAddress = async () => {
    const address = [item.shipping_name, item.shipping_company, item.address_line1, item.address_line2, [item.postal_code, item.city].filter(Boolean).join(' '), item.region, item.shipping_country_code].filter((value) => typeof value === 'string' && value.trim()).join('\n')
    try { await navigator.clipboard.writeText(address); setCopyStatus('Shipping address copied.') } catch { setCopyStatus('The shipping address could not be copied. Select the address fields manually.') }
  }
  return <section className="admin-fulfilment-address" aria-labelledby="fulfilment-address-title"><div className="admin-history-heading"><h3 id="fulfilment-address-title">Fulfilment address</h3><button type="button" className="admin-secondary" onClick={() => void copyAddress()}>Copy address</button></div><DetailList item={item} fields={values} /><p className="admin-muted">The address is read-only after provider-confirmed payment.</p><p className="admin-copy-status" role="status" aria-live="polite">{copyStatus}</p></section>
}

function DetailHistory({ history }: { history: Record<string, Record<string, unknown>[]> }) {
  const entries = Object.entries(history).filter(([, items]) => items.length)
  return <section className="admin-history" aria-labelledby="record-history-title"><h3 id="record-history-title">Related history</h3>{entries.length ? entries.map(([name, items]) => <section key={name} className="admin-history-group"><h4>{name.replaceAll('_', ' ')}</h4><ol>{items.map((entry, index) => <li key={String(entry.id ?? index)}><dl>{Object.entries(entry).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{formatValue(key, value)}</dd></div>)}</dl></li>)}</ol></section>) : <p className="admin-muted">No related history has been recorded.</p>}</section>
}

function ConfirmationStep({ action, attempt, phase, onConfirm, onCancel }: { action: ContextAction; attempt: ReturnType<typeof createActionAttempt>; phase: ActionPhase; onConfirm: (event: FormEvent) => void; onCancel: () => void }) {
  const titleId = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  useEffect(() => { cancel.current?.focus() }, [])
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === 'Escape' && phase !== 'submitting') { event.preventDefault(); event.stopImmediatePropagation(); onCancel() } }; document.addEventListener('keydown', close, true); return () => document.removeEventListener('keydown', close, true) }, [onCancel, phase])
  return <form className="admin-confirmation" onSubmit={onConfirm} aria-labelledby={titleId} aria-busy={phase === 'submitting'}><h5 id={titleId}>Confirm {action.confirmLabel.toLowerCase()}</h5><p>Review the server-bound preview. Only the button below performs the action.</p><dl>{Object.entries(attempt.summary).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{formatValue(key, value)}</dd></div>)}</dl><p className="admin-muted">Confirmation expires {formatValue('expires_at', attempt.confirmationExpiresAt)}.</p><div className="admin-action-buttons"><button ref={cancel} type="button" className="admin-secondary" onClick={onCancel} disabled={phase === 'submitting'}>Cancel</button><button type="submit" disabled={phase === 'submitting' || ['success', 'conflict', 'forbidden'].includes(phase)}>{phase === 'submitting' ? 'Completing…' : action.confirmLabel}</button></div><p className="sr-only" role="status" aria-live="polite">{phase === 'submitting' ? `${action.confirmLabel} in progress.` : ''}</p></form>
}

function LifecycleActionControl({ action, item, resource, token, onChanged, onBusy }: { action: ContextAction; item: Record<string, unknown>; resource: AdminResource; token: string; onChanged: () => void; onBusy: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<ActionPhase>('idle')
  const [message, setMessage] = useState('')
  const [attempt, setAttempt] = useState<ReturnType<typeof createActionAttempt> | null>(null)
  const [countryCode, setCountryCode] = useState('')
  const [shippingAmount, setShippingAmount] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const submitting = useRef(false)
  const initiatingButton = useRef<HTMLButtonElement>(null)
  const outcome = useRef<HTMLParagraphElement>(null)
  const formId = useId()
  useEffect(() => { if (['success', 'conflict', 'forbidden', 'failure'].includes(phase)) outcome.current?.focus() }, [phase])

  const actionPayload = () => {
    if (action.kind === 'invitation') return { reservationId: String(resource === 'reservations' ? item.id : item.interest_request_id) }
    if (action.kind === 'quote') return { invitationId: String(item.id), countryCode, shippingAmount: Number(shippingAmount), expiresAt: new Date(expiresAt).toISOString(), expectedInvitationUpdatedAt: String(item.updated_at) }
    if (action.kind === 'shipping') return { orderId: String(item.id) }
    return { orderId: String(item.id), targetStatus: action.targetStatus, expectedStatus: String(item.fulfilment_status), expectedVersion: fulfilmentVersion(item), ...(action.targetStatus === 'shipped' ? { carrier, trackingNumber } : {}) }
  }

  const preview = async (event: FormEvent) => {
    event.preventDefault(); if (phase === 'previewing' || phase === 'submitting') return
    setPhase('previewing'); setMessage('')
    try {
      const payload = actionPayload()
      const result = await runAdminAction(token, { action: action.previewAction, ...payload })
      const suggested = typeof result.preview?.suggestedAction === 'string' ? result.preview.suggestedAction : null
      const mutation = (action.mutationAction ?? suggested) as NonNullable<ContextAction['mutationAction']> | null
      if (!mutation || !['invitation.send', 'invitation.resend', 'quote.approve', 'fulfilment.transition', 'shipping.retry'].includes(mutation)) throw new Error('The preview did not provide a safe action.')
      if (!result.confirmation || result.confirmation.action !== mutation) throw new Error('The server did not provide a valid confirmation step.')
      setAttempt(createActionAttempt(mutation, payload, result.preview ?? {}, result.confirmation)); setPhase('confirming')
    } catch (error) {
      setPhase(classifyActionError(error)); setMessage(error instanceof Error ? error.message : 'The preview could not be loaded.')
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!attempt || submitting.current) return
    submitting.current = true; onBusy(true); setPhase('submitting'); setMessage('')
    try {
      const result = await runAdminAction(token, { action: attempt.action, ...attempt.payload, confirmationProof: attempt.confirmationProof, idempotencyKey: attempt.idempotencyKey })
      setMessage(actionResultMessage(result))
      const completedPhase = completionPhase(result)
      if (completedPhase === 'failure') setAttempt(null)
      setPhase(completedPhase)
      onChanged()
    } catch (error) {
      setPhase(classifyActionError(error)); setMessage(error instanceof Error ? error.message : 'The confirmed action could not be completed.')
    } finally { submitting.current = false; onBusy(false) }
  }

  const reset = () => { if (submitting.current) return; setAttempt(null); setMessage(''); setPhase('idle'); requestAnimationFrame(() => initiatingButton.current?.focus()) }
  const statusClass = phase === 'success' ? 'admin-success' : phase === 'conflict' ? 'admin-warning' : 'admin-error'
  const statusLabel = phase === 'conflict' ? `The record changed or conflicts with this action. ${message || 'Refresh the action preview.'}` : phase === 'forbidden' ? 'Your current role is not allowed to complete this action.' : message
  const canRetryAttempt = !actionInputsDisabled(phase, attempt)

  return <article className="admin-action-card"><h4>{action.label}</h4><form onSubmit={preview} aria-describedby={`${formId}-help`}><p id={`${formId}-help`} className="admin-muted">Preview is non-mutating. A separate explicit confirmation is required.</p>{action.kind === 'quote' && <div className="admin-action-fields"><label>Destination country code<input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} pattern="[A-Za-z]{2}" maxLength={2} required disabled={phase !== 'idle' && !canRetryAttempt} /></label><label>Shipping amount (EUR)<input type="number" min="0" max="10000" step="0.01" value={shippingAmount} onChange={(event) => setShippingAmount(event.target.value)} required disabled={phase !== 'idle' && !canRetryAttempt} /></label><label>Quote expires<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} required disabled={phase !== 'idle' && !canRetryAttempt} /></label></div>}{action.kind === 'fulfilment' && action.targetStatus === 'shipped' && <div className="admin-action-fields"><label>Carrier<input value={carrier} onChange={(event) => setCarrier(event.target.value)} maxLength={120} required disabled={phase !== 'idle' && !canRetryAttempt} /></label><label>Tracking number<input value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} maxLength={160} required disabled={phase !== 'idle' && !canRetryAttempt} /></label></div>}{!attempt && (phase === 'idle' || phase === 'previewing') && <button ref={initiatingButton} type="submit" disabled={phase === 'previewing'}>{phase === 'previewing' ? 'Loading preview…' : action.label}</button>}</form>{attempt && <ConfirmationStep action={action} attempt={attempt} phase={phase} onConfirm={submit} onCancel={reset} />}{['success', 'conflict', 'forbidden', 'failure'].includes(phase) && <><p ref={outcome} tabIndex={-1} className={`admin-message ${statusClass}`} role={phase === 'success' ? 'status' : 'alert'} aria-live="polite">{statusLabel}</p>{phase !== 'success' && !attempt && <button type="button" className="admin-secondary" onClick={reset}>Start a new preview</button>}{phase === 'conflict' && <button type="button" className="admin-secondary" onClick={reset}>Refresh action preview</button>}</>}</article>
}

function ActionControl(props: { action: ContextAction; item: Record<string, unknown>; resource: AdminResource; token: string; onChanged: () => void; onBusy: (busy: boolean) => void }) {
  return props.action.kind === 'origin' ? <OriginActionControl {...props} /> : <LifecycleActionControl {...props} />
}

function OriginActionControl({ action, item, token, onChanged, onBusy }: { action: ContextAction; item: Record<string, unknown>; resource: AdminResource; token: string; onChanged: () => void; onBusy: (busy: boolean) => void }) {
  const [phase, setPhase] = useState<ActionPhase>('idle')
  const [recordOrigin, setRecordOrigin] = useState(String(item.record_origin ?? 'customer'))
  const [reason, setReason] = useState('')
  const [attempt, setAttempt] = useState<ReturnType<typeof createActionAttempt> | null>(null)
  const [message, setMessage] = useState('')
  const submitting = useRef(false)
  const initiatingButton = useRef<HTMLButtonElement>(null)
  const outcome = useRef<HTMLParagraphElement>(null)
  const formId = useId()
  useEffect(() => { if (['success', 'conflict', 'forbidden', 'failure'].includes(phase)) outcome.current?.focus() }, [phase])
  const payload = { reservationId: String(item.id), recordOrigin, reason, expectedOriginVersion: Number(item.record_origin_version ?? 0) }
  const preview = async (event: FormEvent) => {
    event.preventDefault(); setPhase('previewing'); setMessage('')
    try {
      const result = await runAdminAction(token, { action: action.previewAction, ...payload })
      if (!result.confirmation || result.confirmation.action !== 'origin.change') throw new Error('The server did not provide a valid confirmation step.')
      setAttempt(createActionAttempt('origin.change', payload, result.preview ?? {}, result.confirmation)); setPhase('confirming')
    } catch (error) { setPhase(classifyActionError(error)); setMessage(error instanceof Error ? error.message : 'The preview could not be loaded.') }
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!attempt || submitting.current) return
    submitting.current = true; onBusy(true); setPhase('submitting'); setMessage('')
    try {
      const result = await runAdminAction(token, { action: attempt.action, ...attempt.payload, confirmationProof: attempt.confirmationProof, idempotencyKey: attempt.idempotencyKey })
      setMessage(actionResultMessage(result)); setPhase(completionPhase(result)); onChanged()
    } catch (error) { setPhase(classifyActionError(error)); setMessage(error instanceof Error ? error.message : 'The origin change could not be completed.') } finally { submitting.current = false; onBusy(false) }
  }
  const reset = () => { if (submitting.current) return; setAttempt(null); setMessage(''); setPhase('idle'); requestAnimationFrame(() => initiatingButton.current?.focus()) }
  const statusClass = phase === 'success' ? 'admin-success' : phase === 'conflict' ? 'admin-warning' : 'admin-error'
  return <article className="admin-action-card"><h4>{action.label}</h4><form onSubmit={preview} aria-describedby={`${formId}-help`}><p id={`${formId}-help`} className="admin-muted">Preview is non-mutating and reports every downstream record that derives this origin.</p><div className="admin-action-fields"><label>Record origin<select value={recordOrigin} onChange={(event) => setRecordOrigin(event.target.value)} disabled={phase !== 'idle'}>{recordOrigins.map((origin) => <option key={origin} value={origin}>{origin.replaceAll('_', ' ')}</option>)}</select></label><label>Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required disabled={phase !== 'idle'} /></label><p className="admin-muted">Describe the evidence without including customer contact or address data.</p></div>{!attempt && <button ref={initiatingButton} type="submit" disabled={phase === 'previewing'}>{phase === 'previewing' ? 'Loading preview…' : action.label}</button>}</form>{attempt && <ConfirmationStep action={action} attempt={attempt} phase={phase} onConfirm={submit} onCancel={reset} />}{['success', 'conflict', 'forbidden', 'failure'].includes(phase) && <><p ref={outcome} tabIndex={-1} className={`admin-message ${statusClass}`} role={phase === 'success' ? 'status' : 'alert'} aria-live="polite">{phase === 'conflict' ? `The record changed. ${message}` : phase === 'forbidden' ? 'Manager role is required.' : message}</p>{phase !== 'success' && <button type="button" className="admin-secondary" onClick={reset}>Start a new preview</button>}</>}</article>
}

function HistoryPanel({ token, resource, item, refreshKey }: { token: string; resource: AdminResource; item: Record<string, unknown>; refreshKey: number }) {
  const definitions = useMemo(() => historyDefinitions(resource, item), [resource, item])
  const [history, setHistory] = useState<Record<string, AdminReadResponse>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    if (!definitions.length) { setHistory({}); return }
    setLoading(true); setError('')
    void Promise.all(definitions.map(async (definition) => [definition.resource, await getAdminRead(definition.resource, token, 10, 0, definition.filters)] as const)).then((entries) => { if (alive) { setHistory(Object.fromEntries(entries)); setLoading(false) } }).catch((reason: unknown) => { if (alive) { setError(reason instanceof Error ? reason.message : 'History could not be loaded.'); setLoading(false) } })
    return () => { alive = false }
  }, [definitions, token, refreshKey, retry])
  if (!definitions.length) return null
  return <section className="admin-history" aria-labelledby="record-history-title"><div className="admin-history-heading"><h3 id="record-history-title">Related history</h3>{!loading && <button type="button" className="admin-secondary" onClick={() => setRetry((value) => value + 1)}>Refresh history</button>}</div>{loading ? <p className="admin-state" role="status">Loading contextual history…</p> : error ? <div><p className="admin-state admin-error" role="alert">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry history</button></div> : definitions.map((definition) => { const items = history[definition.resource]?.items ?? []; return <section key={`${definition.resource}-${definition.label}`} className="admin-history-group" aria-labelledby={`history-${definition.resource}`}><h4 id={`history-${definition.resource}`}>{definition.label}</h4>{items.length ? <ol>{items.map((entry, index) => <li key={String(entry.id ?? index)}><dl>{Object.entries(entry).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{formatValue(key, value)}</dd></div>)}</dl></li>)}</ol> : <p className="admin-muted">No recorded {definition.label.toLowerCase()}.</p>}</section> })}</section>
}
