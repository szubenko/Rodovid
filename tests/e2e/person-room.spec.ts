import { expect, test } from '@playwright/test'

test('all 25 rooms resolve the same IDs with readable missing information', async ({ page }, info) => {
  // This scenario loads every room and captures long pages; allow for parallel browser load.
  test.setTimeout(90_000)
  await page.setViewportSize({ width: info.project.name.includes('mobile') ? 320 : 1024, height: 900 })
  for (let id = 1; id <= 25; id++) {
    await page.goto(`/person/I${id}`)
    await expect(page.locator('#person-title')).toBeVisible()
    await expect(page.getByRole('article', { name: 'Відомості про людину' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Розділи кімнати' })).toBeVisible()
    await expect(page.locator('#photos img')).toHaveCount(0)
    await expect(page.locator('input[type="file"], textarea, [contenteditable]')).toHaveCount(0)
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
    if ([1, 9, 25].includes(id)) await page.screenshot({ path: info.outputPath(`room-I${id}.png`), fullPage: true })
  }
})

test('room navigation returns to its current person and preserves history', async ({ page }) => {
  await page.goto('/tree/I1')
  await page.getByRole('link', { name: 'Увійти до кімнати' }).click()
  await expect(page.getByText('Життєвий статус невідомий.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/person\/I1$/)
})
