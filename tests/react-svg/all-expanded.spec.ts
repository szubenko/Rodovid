import { expect, test } from '@playwright/test'

test('Усі відкривається з розгорнутими гілками та зберігає згортання', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/isi-relatives/I108')
  await expect(page.getByRole('link', { name: 'Усі', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(1)
  const toggle = page.locator('[data-children-person-id="I108"]')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
})

test('Усі відкриває гілки домашньої особи', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/isi-relatives/I1')
  await expect(page.locator('[data-person-id="I1"]')).toHaveCount(1, { timeout: 90_000 })
  await expect(page.locator('[data-person-id="I108"]')).toHaveCount(1)
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(1)
  await expect(page.locator('[data-children-person-id="I108"]')).toHaveAttribute('aria-expanded', 'true')
})
