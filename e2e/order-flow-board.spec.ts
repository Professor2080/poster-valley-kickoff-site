import { expect, test } from '@playwright/test'

const sessionKey = 'sb-stbunwkgvxfwmbjivgos-auth-token'
const sourceA = '51000000-0000-4000-8000-000000000015'
const sourceB = '51000000-0000-4000-8000-000000000016'

function interestCard(sourceId: string, threshold: number | null) {
  return {
    source_id: sourceId,
    source_type: 'drop',
    reference_number: `PV-${sourceId.slice(-4)}`,
    stage: 'interest',
    board_version: 1,
    created_at: '2026-08-04T09:00:00.000Z',
    last_activity_at: '2026-08-04T09:00:00.000Z',
    drop_slug: 'eurofighter-typhoon',
    drop_title: 'Eurofighter Typhoon / A2',
    preferred_format: 'A2',
    quantity: 1,
    customer_name: sourceId === sourceA ? 'Threshold Example' : 'Missing Threshold',
    masked_email: 's***@example.invalid',
    country_code: 'NL',
    record_origin: 'customer',
    product_code: 'eurofighter-typhoon-a2',
    production_threshold: threshold,
    qualified_units: 3,
    units_needed: threshold === null ? null : 2,
    threshold_reached: false,
    invitation_id: null,
    invitation_status: null,
    invitation_sent_at: null,
    invitation_expires_at: null,
    invitation_delivery_status: null,
    invitation_count: 0,
    order_id: null,
    order_status: null,
    payment_status: null,
    fulfilment_status: null,
    shipping_email_status: null,
    shipping_reconciliation_required: null,
    carrier: null,
    tracking_number: null,
    delivery_confirmed_at: null,
    closed_at: null,
    needs_attention: false,
    detail_resource: 'reservations',
    detail_id: sourceId,
    currency: 'EUR',
    subtotal_amount: 65,
    shipping_amount: null,
  }
}

test('Order Flow uses five columns and confirms an under-threshold invitation', async ({ page }) => {
  let sent = false
  const requests: string[] = []
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: sessionKey,
    value: {
      access_token: 'synthetic-placeholder',
      refresh_token: 'synthetic-placeholder',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: '50000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated' },
    },
  })
  await page.route('**/api/admin/authorization', async (route) => {
    requests.push('authorization')
    await route.fulfill({ json: { version: 'v1', role: 'manager' } })
  })
  await page.route('**/api/admin/read', async (route) => {
    requests.push('read')
    const first = { ...interestCard(sourceA, 5), ...(sent ? { stage: 'awaiting_payment', invitation_status: 'sent', invitation_sent_at: '2026-08-04T10:00:00.000Z' } : {}) }
    await route.fulfill({ json: {
      version: 'v1', resource: 'order_flow',
      items: [first, interestCard(sourceB, null)],
      page: { limit: 100, offset: 0, total: 2 },
      drops: [{ product_code: 'eurofighter-typhoon-a2', drop_slug: 'eurofighter-typhoon', drop_title: 'Eurofighter Typhoon / A2', lifecycle_mode: 'interest', production_threshold: 5, qualified_units: 3, units_needed: 2, threshold_reached: false, invitations_opened_at: null, updated_at: '2026-08-04T09:00:00.000Z' }],
    } })
  })
  await page.route('**/api/admin/actions', async (route) => {
    const body = route.request().postDataJSON() as { action: string }
    requests.push(body.action)
    if (body.action === 'invitation.preview') {
      await route.fulfill({ json: {
        success: true,
        preview: { productionThreshold: 5, qualifiedUnits: 3, unitsNeeded: 2, thresholdReached: false },
        confirmation: { proof: 'synthetic-proof', action: 'invitation.send', expiresAt: '2099-01-01T00:00:00.000Z', summary: { externalEffect: 'Sends one invitation.', reversibility: 'Failed delivery preserves Interest.' } },
      } })
      return
    }
    sent = true
    await route.fulfill({ json: { success: true, deliveryStatus: 'sent' } })
  })

  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Order flow' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ready to invite' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Awaiting payment' })).toHaveCSS('white-space', 'nowrap')
  await expect(page.getByRole('button', { name: /Send invite/ })).toHaveCount(2)
  await expect(page.getByText('Threshold not configured', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: /Send invite/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Threshold not reached: 3/5 interests. Send invite anyway?')).toBeVisible()
  await dialog.getByRole('button', { name: 'Send invite' }).click()
  await expect(page.getByText('The action completed and the provider accepted the email request. This is not proof of inbox delivery.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Send invite/ })).toHaveCount(1)

  await page.setViewportSize({ width: 720, height: 900 })
  const scrollsHorizontally = await page.locator('.order-flow-scroll').evaluate((element) => element.scrollWidth > element.clientWidth)
  expect(scrollsHorizontally).toBe(true)
  expect(requests.filter((request) => request === 'invitation.send')).toHaveLength(1)
  expect(requests).not.toContain('drop.open.preview')
})
