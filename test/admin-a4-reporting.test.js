import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createCsv,
  exportColumns,
  issueExportConfirmation,
  neutralizeSpreadsheetFormula,
  normalizeExportRequest,
  normalizeReportRequest,
  verifyExportConfirmation,
} from '../api/admin/_reporting.js'

const savedSecret = process.env.ADMIN_CONFIRMATION_SECRET
process.env.ADMIN_CONFIRMATION_SECRET = 'a4-confirmation-secret-that-is-at-least-32-bytes'
process.on('exit', () => { if (savedSecret === undefined) delete process.env.ADMIN_CONFIRMATION_SECRET; else process.env.ADMIN_CONFIRMATION_SECRET = savedSecret })

const now = new Date('2026-07-22T12:00:00.000Z')
const filters = { dropSlug: 'eurofighter-typhoon', destinationCountryCode: 'nl', orderStatus: 'paid', fulfilmentStatus: 'packed', deliveryStatus: 'failed', includeNonCustomer: false }

test('report periods use deterministic UTC boundaries and bounded custom ranges', () => {
  assert.deepEqual(normalizeReportRequest({ preset: '7d', filters: {} }, { now }), {
    preset: '7d', from: '2026-07-15T12:00:00.000Z', to: now.toISOString(),
    filters: { dropSlug: null, destinationCountryCode: null, orderStatus: null, fulfilmentStatus: null, deliveryStatus: null, includeNonCustomer: false },
  })
  const custom = normalizeReportRequest({ preset: 'custom', from: '2026-03-28', to: '2026-03-29', filters }, { now })
  assert.equal(custom.from, '2026-03-28T00:00:00.000Z')
  assert.equal(custom.to, '2026-03-30T00:00:00.000Z')
  assert.equal(custom.filters.destinationCountryCode, 'NL')
  assert.throws(() => normalizeReportRequest({ preset: 'custom', from: '2025-01-01', to: '2026-07-01', filters: {} }, { now }), /366 days/)
  assert.throws(() => normalizeReportRequest({ preset: 'custom', from: '2026-03-30', to: '2026-03-28', filters: {} }, { now }), /invalid/)
})

test('export periods are explicit and limited to 90 days', () => {
  assert.throws(() => normalizeExportRequest({ preset: 'all', exportType: 'orders', filters: {} }, { now }), /explicit period/)
  assert.throws(() => normalizeExportRequest({ preset: 'custom', from: '2026-01-01', to: '2026-06-01', exportType: 'orders', filters: {} }, { now }), /90 days/)
  assert.equal(normalizeExportRequest({ preset: '90d', exportType: 'summary', filters: {} }, { now }).exportType, 'summary')
  assert.throws(() => normalizeExportRequest({ preset: '30d', exportType: 'arbitrary-table', filters: {} }, { now }), /Unknown export type/)
})

test('CSV has stable allowlisted columns, UTF-8, correct escaping and formula neutralisation', () => {
  const csv = createCsv('reservations', [{
    reservation_id: 'r-1', created_at: '2026-07-22T10:00:00Z', design_slug: 'design-one',
    design_title: '=HYPERLINK("https://evil.test")', preferred_format: 'A2, protected', quantity: 1,
    contact_country_code: 'NL', reservation_status: 'new', record_origin: 'test',
    email: 'must-not-export@example.test', token_hash: 'secret', metadata: { private: true },
  }])
  assert.equal(csv.charCodeAt(0), 0xfeff)
  assert.equal(csv.split('\r\n')[0].slice(1), exportColumns.reservations.map((value) => `"${value}"`).join(','))
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/evil[.]test""\)"/)
  assert.match(csv, /"A2, protected"/)
  assert.doesNotMatch(csv, /must-not-export|token_hash|secret|metadata|private/)
  for (const value of ['=1+1', '+cmd', '-2+3', '@SUM(A1)', '  =1']) assert.equal(String(neutralizeSpreadsheetFormula(value)).startsWith("'"), true)
  assert.equal(neutralizeSpreadsheetFormula('ordinary'), 'ordinary')
})

test('export confirmation is bound to manager, filters, type and preview contents', () => {
  const request = normalizeExportRequest({ preset: '30d', exportType: 'orders', filters }, { now })
  const preview = { recordCount: 12, exceedsLimit: false, maximumRecords: 2000, contentFingerprint: 'a'.repeat(32) }
  const issued = issueExportConfirmation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', request, preview)
  assert.doesNotThrow(() => verifyExportConfirmation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', request, issued.proof, preview))
  assert.throws(() => verifyExportConfirmation('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', request, issued.proof, preview), /does not match/)
  assert.throws(() => verifyExportConfirmation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', request, issued.proof, { ...preview, recordCount: 13 }), /changed after preview/)
  assert.throws(() => verifyExportConfirmation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', request, issued.proof, { ...preview, contentFingerprint: 'b'.repeat(32) }), /changed after preview/)
  assert.throws(() => verifyExportConfirmation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', { ...request, exportType: 'payments' }, issued.proof, preview), /does not match/)
})
