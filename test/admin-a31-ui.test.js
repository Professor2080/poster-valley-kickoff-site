import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const ui = await readFile(new URL('../src/admin/AdminApp.tsx', import.meta.url), 'utf8')
const actions = await readFile(new URL('../src/admin/actions.ts', import.meta.url), 'utf8')
const contracts = await readFile(new URL('../src/admin/contracts.ts', import.meta.url), 'utf8')
const api = await readFile(new URL('../src/admin/api.ts', import.meta.url), 'utf8')
const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')

test('reservation and order tables use customer context and unmistakable origin badges', () => {
  assert.match(ui, /reservations: \['customer_name', 'masked_email'/)
  assert.match(ui, /orders: \['customer_name', 'status', 'payment_status', 'fulfilment_status', 'shipping_country_code'/)
  assert.match(ui, /Customer|customer/)
  assert.match(ui, /admin-origin-badge[\s\S]*needs-review/i)
  assert.match(css, /admin-origin-badge\.test[\s\S]*admin-origin-badge\.internal-pilot[\s\S]*admin-origin-badge\.needs-review/i)
})

test('origin filters include explicit exclusion groundwork without PII in URLs', () => {
  assert.match(contracts, /record_origin', 'exclude_origin'/)
  assert.match(api, /post<AdminReadResponse>\('\/api\/admin\/read'/)
  assert.match(api, /post<AdminDetailResponse>\('\/api\/admin\/detail'/)
  assert.doesNotMatch(api, /\/api\/admin\/(?:read|detail)\?/)
})

test('public invitation data is fetched with the capability token in a POST body, never a query string', async () => {
  const component = await readFile(new URL('../src/components/OrderInvitationPage.tsx', import.meta.url), 'utf8')
  const handler = await readFile(new URL('../api/order-invitation.js', import.meta.url), 'utf8')
  assert.match(component, /'\/api\/order-invitation'[\s\S]*method: 'POST'[\s\S]*JSON\.stringify\(\{ token \}\)/)
  assert.doesNotMatch(component, /order-invitation\?token=/)
  assert.match(handler, /ensurePost[\s\S]*readRequestBody\(req\)\.token/)
  assert.match(handler, /Cache-Control', 'private, no-store/)
})

test('manager-only contextual origin operation retains preview, reason and explicit button confirmation', () => {
  assert.match(actions, /role === 'manager'[\s\S]*kind: 'origin'/)
  assert.match(ui, /Preview is non-mutating and reports every downstream record/i)
  assert.match(ui, /Describe the evidence without including customer contact or address data/i)
  assert.doesNotMatch(ui, /Type CONFIRM/)
  assert.match(actions, /Change classification/)
})

test('full shipping detail is separately labelled, copyable and announced accessibly', () => {
  assert.match(ui, /Fulfilment address/)
  assert.match(ui, /navigator\.clipboard\.writeText\(address\)/)
  assert.match(ui, /role="status" aria-live="polite"/)
  assert.match(ui, /read-only after provider-confirmed payment/i)
  assert.match(ui, /role="dialog" aria-modal="true"/)
  assert.match(ui, /modalKeyAction[\s\S]*detailButtons\.current\.get\(restoreFocusKey\)\?\.focus\(\)/)
})

test('responsive Admin detail remains single-column and keyboard-focus visible on mobile', () => {
  assert.match(css, /@media \(max-width: 700px\)[\s\S]*admin-record-fields[\s\S]*grid-template-columns: 1fr/i)
  assert.match(css, /admin-shell select:focus-visible[\s\S]*outline: 3px solid/i)
})
