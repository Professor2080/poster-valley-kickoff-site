import { AdminRequestError, adminError, adminRpc, requireAdmin, setAdminNoStore } from '../_admin.js'
import { ensurePost, PublicRequestError, readRequestBody, sendJson } from '../_supabase.js'
import { createCsv, exportFilename, exportRpcBody, issueExportConfirmation, normalizeExportRequest, verifyExportConfirmation } from './_reporting.js'

export default async function handler(req, res) {
  if (!ensurePost(req, res)) return
  setAdminNoStore(res)
  try {
    let body
    try { body = readRequestBody(req) } catch (error) {
      if (error instanceof PublicRequestError) throw new AdminRequestError(error.status, 'invalid_request', error.message)
      throw error
    }
    const admin = await requireAdmin(req, 'manager')
    const request = normalizeExportRequest(body)
    const rpcBody = exportRpcBody(admin.userId, request)
    const preview = await adminRpc('admin_a4_export_preview', rpcBody)
    if (preview.exceedsLimit) throw new AdminRequestError(409, 'export_limit_exceeded', 'The export contains more than 2,000 rows. Narrow the period or filters.')

    if (body.mode === 'preview') {
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
      return
    }
    if (body.mode !== 'download') throw new AdminRequestError(400, 'invalid_request', 'Export mode must be preview or download.')
    verifyExportConfirmation(admin.userId, request, body.confirmationProof, preview)
    const result = await adminRpc('admin_a4_export', { ...rpcBody, p_expected_fingerprint: preview.contentFingerprint })
    const csv = createCsv(request.exportType, Array.isArray(result.rows) ? result.rows : [])
    res.status(200)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(request.exportType)}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Poster-Valley-Export-Id', String(result.exportId ?? ''))
    res.end(csv)
  } catch (error) { adminError(res, error) }
}
