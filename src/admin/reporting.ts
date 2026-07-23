export const reportPresets = ['7d', '30d', '90d', 'all', 'custom'] as const
export type ReportPreset = (typeof reportPresets)[number]
export const exportTypes = ['reservations', 'invitations', 'orders', 'payments', 'fulfilment', 'summary'] as const
export type ExportType = (typeof exportTypes)[number]

export type AdminReportFilters = {
  dropSlug: string
  destinationCountryCode: string
  orderStatus: string
  fulfilmentStatus: string
  deliveryStatus: string
  includeNonCustomer: boolean
}
export type AdminReportRequest = { preset: ReportPreset; from?: string; to?: string; filters: AdminReportFilters }
export type CurrencyAmount = { currency: string; amount: number; paidOrders?: number }
export type ConversionMetric = { numerator: number; denominator: number }
export type AdminReportSummary = {
  reservations: number
  invitationsSent: number
  ordersStarted: number
  paidOrders: number
  revenue: CurrencyAmount[]
  averageOrderValue: CurrencyAmount[]
  conversion: {
    reservationToInvitation: ConversionMetric
    invitationToOrder: ConversionMetric
    orderToPaid: ConversionMetric
  }
  openFulfilment: number
  fulfilmentAttention: number
  invitationDeliveryPending: number
  invitationDeliveryFailed: number
}
export type ProductReportRow = { dropSlug: string; dropTitle: string; reservations: number; invitationsSent: number; ordersStarted: number; paidOrders: number; openFulfilment: number; revenue: CurrencyAmount[] }
export type CountryReportRow = { countryCode: string; ordersStarted: number; paidOrders: number; openFulfilment: number; revenue: CurrencyAmount[] }
export type AdminReportResponse = {
  version: 'v1'
  generatedAt: string
  period: { preset: ReportPreset; from: string | null; to: string }
  filters: AdminReportFilters
  currencyPolicy: { currentSupportedCurrency: string; groupedByCurrency: boolean; revenueLabel: string; refundSupport: boolean; accountingOutput: boolean }
  summary: AdminReportSummary
  byProduct: ProductReportRow[]
  byCountry: CountryReportRow[]
  queues: {
    fulfilment: Array<{ orderId: string; dropSlug: string; dropTitle: string; fulfilmentStatus: string; shippingEmailStatus: string; destinationCountryCode: string; paidAt: string; attentionRequired: boolean }>
    invitationDelivery: Array<{ invitationId: string; dropSlug: string; dropTitle: string; deliveryStatus: string; deliveryCreatedAt: string }>
  }
  filterApplicability: Record<string, string>
}
export type AdminExportPreview = {
  version: 'v1'
  exportType: ExportType
  recordCount: number
  maximumRecords: number
  exceedsLimit: boolean
  contentFingerprint: string
  period: { from: string; to: string }
  confirmation: { proof: string; expiresAt: string; summary: { recordCount: number; maximumRecords: number; externalEffect: string; reversibility: string } }
}

export const emptyReportFilters = (): AdminReportFilters => ({ dropSlug: '', destinationCountryCode: '', orderStatus: '', fulfilmentStatus: '', deliveryStatus: '', includeNonCustomer: false })

export function conversionPercentage(metric: ConversionMetric) {
  if (!metric.denominator) return '—'
  return `${((metric.numerator / metric.denominator) * 100).toFixed(1)}%`
}

export function formatCurrencyBuckets(values: CurrencyAmount[], locale = 'en-GB') {
  if (!values.length) return '—'
  return values.map(({ currency, amount }) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)).join(' / ')
}

export function reportState({ loading, error, hasReport }: { loading: boolean; error: string; hasReport: boolean }) {
  if (loading) return 'loading' as const
  if (error) return 'error' as const
  return hasReport ? 'ready' as const : 'empty' as const
}

export function canExportPeriod(request: AdminReportRequest) {
  if (request.preset === 'all') return false
  if (request.preset !== 'custom') return true
  if (!request.from || !request.to) return false
  const from = Date.parse(`${request.from}T00:00:00.000Z`)
  const to = Date.parse(`${request.to}T00:00:00.000Z`)
  return Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from < 90 * 86400000
}
