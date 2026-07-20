import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { AdminApiError, getAdminRead, getAuthorization } from './api'
import { adminResources, boundedOffset, resourceFilters, type AdminReadResponse, type AdminResource, type AdminRole } from './contracts'
import { hasBrowserSupabaseConfig, supabase } from './supabase'

const labels: Record<AdminResource | 'overview', string> = { overview: 'Overview', reservations: 'Reservations', invitations: 'Invitations', orders: 'Orders', payments: 'Payments', events: 'Events', products: 'Products' }
const pageSize = 25

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
      if (!candidate?.access_token) { setSession(null); setScreen('login'); return }
      setScreen('checking')
      try {
        const result = await getAuthorization(candidate.access_token)
        if (!alive) return
        setSession(candidate); setRole(result.role); setScreen('shell')
        if (callback) window.history.replaceState({}, '', '/admin')
      } catch (error) {
        if (!alive) return
        setSession(null); setRole(null)
        if (error instanceof AdminApiError && error.status === 403) setScreen('denied')
        else { await client.auth.signOut(); setNotice('Your session has expired or is no longer valid. Please sign in again.'); setScreen('login') }
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
  return <main className="admin-shell"><a className="admin-skip" href="#admin-content">Skip to content</a><header className="admin-header"><a href="/admin" className="admin-brand">Poster Valley <span>Operations</span></a><div><span className="admin-role">Verified {role}</span><button className="admin-logout" onClick={() => void onLogout()}>Sign out</button></div></header><div className="admin-layout"><nav className="admin-nav" aria-label="Admin sections">{(['overview', ...adminResources] as const).map((item) => <button key={item} aria-current={section === item ? 'page' : undefined} className={section === item ? 'active' : ''} onClick={() => setSection(item)}>{labels[item]}</button>)}</nav><section id="admin-content" className="admin-content" tabIndex={-1}>{section === 'overview' ? <Overview token={token} /> : <ReadList resource={section} token={token} />}</section></div></main>
}

function Overview({ token }: { token: string }) { return <section aria-labelledby="overview-title"><p className="admin-kicker">Read-only workspace</p><h1 id="overview-title">Overview</h1><p className="admin-intro">A bounded snapshot of operational records. Totals come directly from the A1 read contract; no revenue or accounting claim is shown.</p><div className="admin-metrics">{(['reservations', 'invitations', 'orders', 'payments'] as const).map((resource) => <Metric key={resource} resource={resource} token={token} />)}</div></section> }
function Metric({ resource, token }: { resource: AdminResource; token: string }) { const [value, setValue] = useState<string>('…'); useEffect(() => { let alive = true; void getAdminRead(resource, token, 1, 0, {}).then((data) => alive && setValue(String(data.page.total))).catch(() => alive && setValue('Unavailable')); return () => { alive = false } }, [resource, token]); return <article className="admin-metric"><p>{labels[resource]}</p><strong>{value}</strong><span>records</span></article> }

function ReadList({ resource, token }: { resource: AdminResource; token: string }) {
  const [offset, setOffset] = useState(0); const [filters, setFilters] = useState<Record<string, string>>({}); const [data, setData] = useState<AdminReadResponse | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [selected, setSelected] = useState<Record<string, unknown> | null>(null)
  useEffect(() => { setOffset(0); setFilters({}); setSelected(null) }, [resource])
  useEffect(() => { let alive = true; setLoading(true); setError(''); void getAdminRead(resource, token, pageSize, offset, filters).then((response) => { if (alive) { setData(response); setLoading(false) } }).catch((reason: unknown) => { if (alive) { setError(reason instanceof Error ? reason.message : 'Unable to load records.'); setLoading(false) } }); return () => { alive = false } }, [resource, token, offset, filters])
  const fields = useMemo(() => data?.items.length ? Object.keys(data.items[0]) : [], [data])
  const updateFilter = (name: string, value: string) => { setOffset(0); setFilters((current) => ({ ...current, [name]: value })) }
  return <section aria-labelledby={`${resource}-title`}><p className="admin-kicker">Read-only records</p><h1 id={`${resource}-title`}>{labels[resource]}</h1><div className="admin-filters" aria-label={`${labels[resource]} filters`}>{resourceFilters[resource].map((filter) => <label key={filter}>{filter.replaceAll('_', ' ')}<input value={filters[filter] ?? ''} onChange={(event) => updateFilter(filter, event.target.value)} placeholder="Exact status" /></label>)}</div>{loading ? <p className="admin-state" role="status">Loading {labels[resource].toLowerCase()}…</p> : error ? <p className="admin-state admin-error" role="alert">{error}</p> : !data?.items.length ? <p className="admin-state">No matching {labels[resource].toLowerCase()} were found.</p> : <><div className="admin-table-wrap"><table><caption className="sr-only">{labels[resource]} records</caption><thead><tr>{fields.map((field) => <th key={field}>{field.replaceAll('_', ' ')}</th>)}<th><span className="sr-only">Details</span></th></tr></thead><tbody>{data.items.map((item, index) => <tr key={String(item.id ?? item.product_code ?? index)}>{fields.map((field) => <td key={field}>{formatValue(item[field])}</td>)}<td><button className="admin-detail-button" onClick={() => setSelected(item)}>View<span className="sr-only"> record details</span></button></td></tr>)}</tbody></table></div><Pagination page={data.page} onPrevious={() => setOffset(boundedOffset(offset, pageSize, data.page.total, 'previous'))} onNext={() => setOffset(boundedOffset(offset, pageSize, data.page.total, 'next'))} /></>}{selected && <Detail item={selected} title={labels[resource]} onClose={() => setSelected(null)} />}</section>
}
function formatValue(value: unknown) { if (value === null || value === undefined || value === '') return '—'; if (typeof value === 'string' && /_at$/.test(value)) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? value : date.toLocaleString() } return String(value).replaceAll('_', ' ') }
function Pagination({ page, onPrevious, onNext }: { page: { limit: number; offset: number; total: number }; onPrevious: () => void; onNext: () => void }) { const start = page.total ? page.offset + 1 : 0; const end = Math.min(page.offset + page.limit, page.total); return <nav className="admin-pagination" aria-label="Pagination"><span>{start}–{end} of {page.total}</span><div><button onClick={onPrevious} disabled={page.offset === 0}>Previous</button><button onClick={onNext} disabled={page.offset + page.limit >= page.total}>Next</button></div></nav> }
function Detail({ item, title, onClose }: { item: Record<string, unknown>; title: string; onClose: () => void }) { return <div className="admin-dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="admin-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()}><div><h2 id="detail-title">{title} details</h2><button onClick={onClose} autoFocus>Close</button></div><dl>{Object.entries(item).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{formatValue(value)}</dd></div>)}</dl></section></div> }
