import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const [app, reporting, styles] = await Promise.all([
  readFile(new URL('../src/admin/AdminApp.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/admin/AdminReporting.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/index.css', import.meta.url), 'utf8'),
])

test('Reporting navigation and API surface remain manager-only', () => {
  assert.match(app, /role === 'manager'[^\n]+\['overview', 'reporting'/)
  assert.doesNotMatch(app, /role === 'operator'[^\n]+reporting/)
  assert.match(reporting, /Manager-only operational reporting/)
})

test('reporting UI includes filters, definitions and honest financial wording', () => {
  for (const text of ['Last 7 days', 'Last 30 days', 'Last 90 days', 'All time', 'Custom dates', 'Design slug', 'Destination country', 'Order status', 'Fulfilment status', 'Invitation delivery']) assert.match(reporting, new RegExp(text))
  assert.match(reporting, /Paid gross revenue/)
  assert.match(reporting, /not accounting or tax output/)
  assert.match(reporting, /Refunds are not yet represented reliably/)
  assert.match(reporting, /Metric definitions and limitations/)
  assert.match(reporting, /state === 'loading'[\s\S]*state === 'error'[\s\S]*state === 'empty'/)
})

test('export UI has explicit confirmation, honest outcomes and excluded-field disclosure', () => {
  assert.match(reporting, /Review export/)
  assert.match(reporting, /Confirm [\s\S]* export/)
  assert.match(reporting, /Download audited CSV/)
  assert.match(reporting, /maximum [\s\S]*append-only audit event/)
  assert.match(reporting, /Names, emails, addresses, tokens, payment-provider IDs, tracking values, metadata and audit payloads are excluded/)
  assert.match(reporting, /role="status" aria-live="polite"/)
  assert.match(reporting, /role="alert"/)
})

test('reporting styles preserve keyboard focus and responsive mobile layout', () => {
  assert.match(styles, /admin-report-filters[^}]+grid-template-columns: repeat\(auto-fit/i)
  assert.match(styles, /admin-report-filters input:focus-visible[\s\S]*outline: 3px solid/i)
  assert.match(styles, /@media \(max-width: 700px\)[^{]*\{[^}]*admin-report-filters/i)
})
