import assert from 'node:assert/strict'
import test from 'node:test'
import { applyApprovedManualQuote, quoteForInvitation } from '../api/_commerce.js'

const invitation = { drop_slug: 'eurofighter-typhoon', quantity: 1, unit_price: 17.75, currency: 'EUR' }
test('approved unexpired manual quote changes only manual-review shipping', () => {
  const base = quoteForInvitation(invitation, 'US')
  assert.equal(base.supported, false)
  const result = applyApprovedManualQuote(invitation, 'US', base, { id: 'fixture', status: 'approved', currency: 'EUR', country_code: 'US', shipping_amount: '21.50', expires_at: '2099-01-01T00:00:00Z' })
  assert.equal(result.supported, true); assert.equal(result.shipping, 21.5); assert.equal(result.unitPrice, 17.75); assert.equal(result.total, 39.25)
})
test('expired, cancelled, mismatched and standard quotes cannot override server quote', () => {
  const base = quoteForInvitation(invitation, 'US')
  for (const quote of [{ status: 'cancelled', currency: 'EUR', country_code: 'US', shipping_amount: 1, expires_at: '2099-01-01T00:00:00Z' }, { status: 'approved', currency: 'EUR', country_code: 'US', shipping_amount: 1, expires_at: '2000-01-01T00:00:00Z' }, { status: 'approved', currency: 'USD', country_code: 'US', shipping_amount: 1, expires_at: '2099-01-01T00:00:00Z' }]) assert.equal(applyApprovedManualQuote(invitation, 'US', base, quote).supported, false)
})
test('manual quote never overrides an authoritative automatic EU rate', () => {
  const base = quoteForInvitation(invitation, 'NL')
  assert.equal(applyApprovedManualQuote(invitation, 'NL', base, { status: 'approved', currency: 'EUR', country_code: 'NL', shipping_amount: 1, expires_at: '2099-01-01T00:00:00Z' }).shipping, 5.95)
})
