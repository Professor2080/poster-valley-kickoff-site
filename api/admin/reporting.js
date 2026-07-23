import { AdminRequestError, adminError, adminRpc, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensurePost, PublicRequestError, readRequestBody, sendJson } from '../_supabase.js'
import { createCsv, exportFilename, exportRpcBody, issueExportConfirmation, normalizeExportRequest, normalizeReportRequest, reportingRpcBody, verifyExportConfirmation } from './_reporting.js'

const operations = new Set(['report', 'export_preview', 'export_download'])

function readBody(req) {
  try { return readRequestBody(req) }
  catch (error) {
    if (error instanceof PublicRequestError) throw new AdminRequestError(error.status, 'invalid_request', error.message)
    throw error
  }
}

async function report(res, admin, body) {
  const request = normalizeReportRequest(body)
  const result = await adminRpc('admin_a4_report', reportingRpcBody(admin.userId, request))
  sendJson(res, 200, { ...result, period: { preset: request.preset, from: request.from, to: request.to }, filters: request.filters })
}

async function exportPreview(res, admin, request, preview) {
  const confirmation = issueExportConfirmation(admin.userId, request, preview)
  sendJson(res, 200, {
    version: 'v1', exportType: request.exportType, period: { from: request.from, to: request.to },
    filters: request.filters, ...preview,
    confirmation: {
      proof: confirmation.proof, expiresAt: confirmation.expiresAt,
      summary: {
        recordCount: preview.recordCount,
        maximumRecords: preview.maximumRecords,
        externalEffect: 'Generates and downloads one audited CSV export.',
        reversibility: 'The downloaded file can be deleted; the minimized audit event is append-only.',
      },
    },
  })
}

async function exportDownload(res, admin, body, request, preview) {
  verifyExportConfirmation(admin.userId, request, body.confirmationProof, preview)
  const rpcBody = exportRpcBody(admin.userId, request)
  const result = await adminRpc('admin_a4_export', { ...rpcBody, p_expected_fingerprint: preview.contentFingerprint })
  const csv = createCsv(request.exportType, Array.isArray(result.rows) ? result.rows : [])
  res.status(200)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(request.exportType)}"`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Poster-Valley-Export-Id', String(result.exportId ?? ''))
  res.end(csv)
}

export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  setAdminNoStore(res)
  try {
    const body = readBody(req)
    const admin = await requireAdmin(req, 'manager')
    if (typeof body.operation !== 'string' || !operations.has(body.operation)) {
      throw new AdminRequestError(400, 'invalid_reporting_operation', 'Reporting operation is not supported.')
    }
    if (body.operation === 'report') { await report(res, admin, body); return }

    const request = normalizeExportRequest(body)
    const rpcBody = exportRpcBody(admin.userId, request)
    const preview = await adminRpc('admin_a4_export_preview', rpcBody)
    if (preview.exceedsLimit) throw new AdminRequestError(409, 'export_limit_exceeded', 'The export contains more than 2,000 rows. Narrow the period or filters.')
    if (body.operation === 'export_preview') { await exportPreview(res, admin, request, preview); return }
    await exportDownload(res, admin, body, request, preview)
  } catch (error) { adminError(res, error) }
}
