import { test, expect } from '@playwright/test'

const EMAIL = 'e2efollow@test.local'
const PASS = 'testpassword1'
const TARGET_USERNAME = 'kitakitsofficial'

// Temporary repro: click "Follow" in the header search dropdown and verify the
// toggle actually lands. Seeded by scripts/e2e-prep-follow.ts (run first).
test.describe('search follow button', () => {
  test('clicking Follow creates the follow', async ({ page }) => {
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('BROWSER ERROR:', msg.text())
    })
    page.on('requestfailed', (req) => console.log('REQ FAILED:', req.url()))

    await page.goto('http://localhost:3000/login')
    await page.fill('#email', EMAIL)
    await page.fill('#password', PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/localhost:3000\/(home|profile)/, { timeout: 20000 })
    await page.goto('http://localhost:3000/home')

    const search = page.getByRole('combobox', { name: 'Search' })
    await search.fill('kitakits')

    const results = page.locator('#header-search-results')
    await expect(results).toBeVisible({ timeout: 15000 })

    const row = results.locator(`[id^="header-search-option-"]`, {
      hasText: `@${TARGET_USERNAME}`,
    })
    await expect(row).toBeVisible()
    const followBtn = row.getByRole('button')
    await expect(followBtn).toHaveText('Follow')

    await followBtn.click()

    // Optimistic flip happens instantly; wait through the remote-DB round trip
    // to prove it sticks (a failed action reverts the label).
    await expect(followBtn).toHaveText('Unfollow', { timeout: 15000 })
    await page.waitForTimeout(4000)
    await expect(followBtn).toHaveText('Unfollow')
  })
})
