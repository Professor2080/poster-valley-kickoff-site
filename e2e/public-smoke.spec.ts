import { expect, test } from '@playwright/test'

test('public homepage and privacy route render without browser or server errors', async ({ page }) => {
  const consoleErrors: string[] = []
  const serverErrors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('response', (response) => {
    if (response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`)
    }
  })

  await page.goto('/')
  await expect(page).toHaveTitle('Poster Valley - Curated poster drops')
  await expect(page.getByRole('link', { name: 'Poster Valley' }).first()).toBeVisible()

  await page.goto('/privacy')
  await expect(page.getByRole('heading', { name: 'How we handle your details.' })).toBeVisible()

  expect(consoleErrors).toEqual([])
  expect(serverErrors).toEqual([])
})
