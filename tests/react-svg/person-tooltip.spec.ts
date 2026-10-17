import { expect, test } from '@playwright/test'
import '../e2e/person-tooltip.spec'

for (const screen of ['tree', 'horizontal', 'vertical', 'relatives']) {
  test(`підказка всіх фактів і навігація на діаграмі ${screen}`, async ({ page }, info) => {
    await page.goto(`/${screen}/I12`)
    const node = page.locator('[data-map-viewport] [data-center="true"]')
    await page.keyboard.press('Tab')
    await node.focus()
    const tooltip = page.getByRole('tooltip')
    await expect(tooltip).toHaveAttribute('data-tooltip-person-id', 'I12')
    await expect(tooltip.locator('[data-event-id]')).not.toHaveCount(0)
    await expect(tooltip.locator('[data-relation-id]')).not.toHaveCount(0)
    const box = await tooltip.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    await page.screenshot({ path: info.outputPath(`${screen}-tooltip.png`) })
    await page.keyboard.press('Escape')
    await expect(tooltip).toHaveCount(0)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/person\/I12$/)
  })
}

test('підказка лишається доступною на розгорнутій діаграмі; Esc спершу закриває її', async ({ page }) => {
  await page.goto('/relatives/I12')
  await page.getByRole('button', { name: 'На весь екран', exact: true }).click()
  const expanded = page.locator('[data-map-expanded="true"]')
  await page.keyboard.press('Tab')
  await expanded.locator('[data-center="true"]').focus()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(tooltip.locator('[data-tooltip-scroll]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
  await expect(expanded).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(expanded).toHaveCount(0)
})
