import { expect, test } from '@playwright/test'

test('all 74 rooms resolve the same IDs with readable missing information', async ({ page }, info) => {
  // This scenario loads every room and captures long pages; allow for parallel browser load.
  test.setTimeout(150_000)
  await page.setViewportSize({ width: info.project.name.includes('mobile') ? 320 : 1024, height: 900 })
  const response = await page.request.get('/data/family.json')
  const family = await response.json() as { people: { id: string }[] }
  expect(family.people).toHaveLength(74)
  for (const { id } of family.people) {
    await page.goto(`/person/${id}`)
    await expect(page.locator('#person-title')).toBeVisible()
    await expect(page.getByRole('article', { name: 'Відомості про людину' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Розділи кімнати' })).toHaveCount(0)
    await expect(page.locator('#photos img')).toHaveCount(0)
    await expect(page.locator('input[type="file"], textarea, [contenteditable]')).toHaveCount(0)
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
    if (['I1', 'I9', 'I25'].includes(id)) await page.screenshot({ path: info.outputPath(`room-${id}.png`), fullPage: true })
  }
})

test('room navigation returns to its current person and preserves history', async ({ page }) => {
  await page.goto('/tree/I1')
  await page.getByRole('link', { name: 'Увійти до кімнати' }).click()
  await expect(page.locator('#archive')).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: 'Розділи кімнати' }).locator('a[href="#archive"]')).toHaveCount(0)
  await expect(page.getByText('Життєвий статус невідомий.', { exact: true })).toHaveCount(0)
  await expect(page.getByText('Походження запису людини', { exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/person\/I1$/)
})
