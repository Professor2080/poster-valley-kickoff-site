import { useEffect, useState, type FormEvent } from 'react'
import { downloadAdminExport, getAdminReport, previewAdminExport } from './api'
import { formatValue } from './contracts'
import {
  canExportPeriod,
  conversionPercentage,
  emptyReportFilters,
  exportTypes,
  formatCurrencyBuckets,
  reportState,
  type AdminExportPreview,
  type AdminReportRequest,
  type AdminReportResponse,
  type ExportType,
  type ReportPreset,
} from './reporting'

const orderStatuses = ['draft', 'awaiting_payment', 'payment_open', 'paid', 'payment_failed', 'payment_expired', 'cancelled', 'shipped']
const fulfilmentStatuses = ['unfulfilled', 'ready_to_pack', 'packed', 'shipped']
const deliveryStatuses = ['pending', 'failed', 'suppressed', 'sent']

export function Reporting({ token }: { token: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const thirtyDaysAgo = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)
  const [preset, setPreset] = useState<ReportPreset>('30d')
  const [from, setFrom] = useState(thirtyDaysAgo)
  const [to, setTo] = useState(today)
  const [filters, setFilters] = useState(emptyReportFilters)
  const [applied, setApplied] = useState<AdminReportRequest>({ preset: '30d', filters: emptyReportFilters() })
  const [report, setReport] = useState<AdminReportResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const [exportType, setExportType] = useState<ExportType>('reservations')
  const [exportPreview, setExportPreview] = useState<AdminExportPreview | null>(null)
  const [exportStatus, setExportStatus] = useState('')
  const [exportError, setExportError] = useState('')
  const [exportBusy, setExportBusy] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    setExportPreview(null)
    setExportStatus('')
    setExportError('')
    void getAdminReport(token, applied)
      .then((value) => { if (alive) { setReport(value); setLoading(false) } })
      .catch((reason: unknown) => { if (alive) { setError(reason instanceof Error ? reason.message : 'Reporting could not be loaded.'); setLoading(false) } })
    return () => { alive = false }
  }, [token, applied, retry])

  const submitFilters = (event: FormEvent) => {
    event.preventDefault()
    setApplied({
      preset,
      ...(preset === 'custom' ? { from, to } : {}),
      filters: { ...filters, destinationCountryCode: filters.destinationCountryCode.toUpperCase() },
    })
  }
  const setFilter = <K extends keyof typeof filters>(key: K, value: (typeof filters)[K]) => {
    setFilters((current) => ({ ...current, [key]: value }))
  }
  const startExport = async () => {
    setExportBusy(true); setExportError(''); setExportStatus(''); setExportPreview(null)
    try { setExportPreview(await previewAdminExport(token, exportType, applied)) }
    catch (reason) { setExportError(reason instanceof Error ? reason.message : 'The export preview could not be prepared.') }
    finally { setExportBusy(false) }
  }
  const selectExportType = (value: ExportType) => {
    setExportType(value)
    setExportPreview(null)
    setExportStatus('')
    setExportError('')
  }
  const downloadExport = async () => {
    if (!exportPreview) return
    setExportBusy(true); setExportError(''); setExportStatus('')
    try {
      const download = await downloadAdminExport(token, exportType, applied, exportPreview.confirmation.proof, exportPreview.period)
      const url = URL.createObjectURL(download.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = download.filename
      link.click()
      URL.revokeObjectURL(url)
      setExportStatus(`Export generated: ${download.filename} (${exportPreview.recordCount} records). The action was added to the audit history.`)
      setExportPreview(null)
    } catch (reason) { setExportError(reason instanceof Error ? reason.message : 'The export could not be downloaded.') }
    finally { setExportBusy(false) }
  }
  const state = reportState({ loading, error, hasReport: Boolean(report) })

  return <section aria-labelledby="reporting-title">
    <p className="admin-kicker">Manager-only operational reporting</p>
    <h1 id="reporting-title">Reporting</h1>
    <p className="admin-intro">Paid gross revenue counts each provider-confirmed paid order once and stays separated by currency. These figures are operational, not accounting or tax output. Refunds are not yet represented reliably, so no net revenue is shown.</p>
    <form className="admin-report-filters" onSubmit={submitFilters}>
      <label>Period<select value={preset} onChange={(event) => setPreset(event.target.value as ReportPreset)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option><option value="custom">Custom dates</option></select></label>
      {preset === 'custom' && <><label>Start date<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} required /></label><label>End date<input type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value)} required /></label></>}
      <label>Design slug<input value={filters.dropSlug} onChange={(event) => setFilter('dropSlug', event.target.value.toLowerCase())} maxLength={120} placeholder="All designs" /></label>
      <label>Destination country<input value={filters.destinationCountryCode} onChange={(event) => setFilter('destinationCountryCode', event.target.value.toUpperCase())} maxLength={2} pattern="[A-Za-z]{2}" placeholder="All" /></label>
      <label>Order status<select value={filters.orderStatus} onChange={(event) => setFilter('orderStatus', event.target.value)}><option value="">All</option>{orderStatuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label>Fulfilment status<select value={filters.fulfilmentStatus} onChange={(event) => setFilter('fulfilmentStatus', event.target.value)}><option value="">All</option>{fulfilmentStatuses.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label>
      <label>Invitation delivery<select value={filters.deliveryStatus} onChange={(event) => setFilter('deliveryStatus', event.target.value)}><option value="">Open and failed</option>{deliveryStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label className="admin-report-checkbox"><input type="checkbox" checked={filters.includeNonCustomer} onChange={(event) => setFilter('includeNonCustomer', event.target.checked)} /> Include test and internal-pilot records</label>
      <button type="submit" disabled={loading}>Apply report filters</button>
    </form>
    <p className="admin-muted">Destination country, order and fulfilment filters apply only to order, payment, revenue and fulfilment metrics. Reservation contact country is never treated as a shipping destination.</p>
    {state === 'loading' ? <p className="admin-state" role="status">Calculating server-authoritative reporting…</p> : state === 'error' ? <div><p className="admin-state admin-error" role="alert">{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)}>Retry reporting</button></div> : state === 'empty' ? <p className="admin-state">No report is available.</p> : report && <ReportResults report={report} />}
    <Exports exportType={exportType} setExportType={selectExportType} applied={applied} preview={exportPreview} busy={exportBusy} status={exportStatus} error={exportError} start={startExport} download={downloadExport} cancel={() => setExportPreview(null)} />
  </section>
}

function ReportResults({ report }: { report: AdminReportResponse }) {
  const summary = report.summary
  const conversion = summary.conversion
  return <div className="admin-report-results">
    <p className="admin-muted">Generated {new Date(report.generatedAt).toLocaleString()} · Customer records only unless explicitly included.</p>
    <div className="admin-metrics admin-report-metrics">
      <ReportMetric label="Reservations" value={summary.reservations} />
      <ReportMetric label="Invitations sent" value={summary.invitationsSent} />
      <ReportMetric label="Orders started" value={summary.ordersStarted} />
      <ReportMetric label="Paid orders" value={summary.paidOrders} />
      <ReportMetric label="Paid gross revenue" value={formatCurrencyBuckets(summary.revenue)} />
      <ReportMetric label="Average order value" value={formatCurrencyBuckets(summary.averageOrderValue)} />
      <ReportMetric label="Reservation → invitation" value={conversionPercentage(conversion.reservationToInvitation)} detail={`${conversion.reservationToInvitation.numerator} / ${conversion.reservationToInvitation.denominator}`} />
      <ReportMetric label="Invitation → order" value={conversionPercentage(conversion.invitationToOrder)} detail={`${conversion.invitationToOrder.numerator} / ${conversion.invitationToOrder.denominator}`} />
      <ReportMetric label="Order → paid" value={conversionPercentage(conversion.orderToPaid)} detail={`${conversion.orderToPaid.numerator} / ${conversion.orderToPaid.denominator}`} />
      <ReportMetric label="Open fulfilment" value={summary.openFulfilment} />
      <ReportMetric label="Fulfilment attention" value={summary.fulfilmentAttention} />
      <ReportMetric label="Invitation delivery" value={`${summary.invitationDeliveryFailed} failed`} detail={`${summary.invitationDeliveryPending} pending`} />
    </div>
    <ReportTable title="By design" rows={report.byProduct} fields={['dropTitle', 'reservations', 'invitationsSent', 'ordersStarted', 'paidOrders', 'openFulfilment', 'revenue']} />
    <ReportTable title="By destination country" rows={report.byCountry} fields={['countryCode', 'ordersStarted', 'paidOrders', 'openFulfilment', 'revenue']} />
    <div className="admin-report-queues"><Queue title="Open fulfilment queue" rows={report.queues.fulfilment} /><Queue title="Invitation delivery attention" rows={report.queues.invitationDelivery} /></div>
    <details className="admin-report-definitions"><summary>Metric definitions and limitations</summary><ul><li>Reservations use reservation creation time; invitations sent use confirmed sent time; orders started use order creation time; paid metrics use canonical provider-confirmed paid time.</li><li>Conversion uses fixed cohorts: reservations created, invitations sent and orders created in the selected period. Later linked stages are evaluated as of report generation.</li><li>Valid paid payments must match the order amount and currency and contain Mollie provider, webhook and paid evidence. One payment is selected per order.</li><li>Revenue and AOV are grouped by currency. Refunds are not modelled reliably, so no net-revenue claim is made.</li><li>Fulfilment attention means ready-to-pack/packed, incomplete shipping data, or a failed shipping email—not an invented SLA.</li></ul></details>
  </div>
}

function Exports({ exportType, setExportType, applied, preview, busy, status, error, start, download, cancel }: { exportType: ExportType; setExportType: (value: ExportType) => void; applied: AdminReportRequest; preview: AdminExportPreview | null; busy: boolean; status: string; error: string; start: () => Promise<void>; download: () => Promise<void>; cancel: () => void }) {
  const allowed = canExportPeriod(applied)
  return <section className="admin-exports" aria-labelledby="exports-title"><h2 id="exports-title">Controlled CSV exports</h2><p>Exports contain only report fields. Names, emails, addresses, tokens, payment-provider IDs, tracking values, metadata and audit payloads are excluded.</p>
    <div className="admin-export-controls"><label>Export type<select value={exportType} onChange={(event) => setExportType(event.target.value as ExportType)}>{exportTypes.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select></label><button type="button" onClick={() => void start()} disabled={busy || !allowed}>{busy ? 'Preparing…' : 'Review export'}</button></div>
    {!allowed && <p className="admin-message admin-warning">Exports require an explicit period of no more than 90 days. Select 7, 30, 90 or a shorter custom period.</p>}
    {preview && <div className="admin-export-confirmation" role="region" aria-labelledby="export-confirm-title"><h3 id="export-confirm-title">Confirm {exportType.replaceAll('_', ' ')} export</h3><p>This will generate <strong>{preview.recordCount}</strong> records (maximum {preview.maximumRecords}) and add a minimized, append-only audit event.</p><p>{preview.confirmation.summary.externalEffect} {preview.confirmation.summary.reversibility}</p><div className="admin-action-buttons"><button type="button" onClick={() => void download()} disabled={busy}>{busy ? 'Generating…' : 'Download audited CSV'}</button><button type="button" className="admin-secondary" onClick={cancel} disabled={busy}>Cancel</button></div></div>}
    {status && <p className="admin-message admin-success" role="status" aria-live="polite">{status}</p>}{error && <p className="admin-message admin-error" role="alert">{error}</p>}
  </section>
}

function ReportMetric({ label, value, detail = '' }: { label: string; value: string | number; detail?: string }) { return <article className="admin-metric"><p>{label}</p><strong>{value}</strong><span>{detail || 'Server calculated'}</span></article> }
function ReportTable({ title, rows, fields }: { title: string; rows: Record<string, unknown>[]; fields: string[] }) { const id = `report-${title.replaceAll(' ', '-')}`; return <section className="admin-report-section" aria-labelledby={id}><h2 id={id}>{title}</h2>{rows.length ? <div className="admin-table-wrap"><table><thead><tr>{fields.map((field) => <th key={field}>{field.replaceAll(/([A-Z])/g, ' $1')}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.dropSlug ?? row.countryCode ?? index)}>{fields.map((field) => <td key={field}>{field === 'revenue' ? formatCurrencyBuckets(row[field] as { currency: string; amount: number }[]) : formatValue(field, row[field])}</td>)}</tr>)}</tbody></table></div> : <p className="admin-state">No matching rows.</p>}</section> }
function Queue({ title, rows }: { title: string; rows: Record<string, unknown>[] }) { return <section className="admin-report-section"><h2>{title}</h2>{rows.length ? <ol className="admin-report-queue">{rows.map((row, index) => <li key={String(row.orderId ?? row.invitationId ?? index)}><strong>{String(row.dropTitle ?? row.dropSlug ?? 'Design')}</strong><span>{String(row.fulfilmentStatus ?? row.deliveryStatus ?? '')}</span><span>{String(row.destinationCountryCode ?? '')}</span></li>)}</ol> : <p className="admin-state">No items require attention.</p>}</section> }
