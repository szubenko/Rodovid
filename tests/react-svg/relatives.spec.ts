import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('бокові гілки: брати й сестри, розкриття, згортання та повернення', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/vertical/I1')
  await page.getByLabel('Покоління', { exact: true }).selectOption('3')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await expect(svg.locator('[data-person-id="I27"]')).toHaveCount(1) // father's brother
  await expect(svg.locator('[data-person-id="I32"]')).toHaveCount(1) // grandmother's sibling
  await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(0)
  const branch = svg.locator('[data-branch-person-id="I69"]')
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  const initialCount = await svg.locator('[data-person-id]').count()
  if (isMobile) await branch.tap()
  else await branch.click()
  await expect(page).toHaveURL(/\/vertical\/I1$/)
  await expect(branch).toHaveAttribute('aria-expanded', 'true')
  await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(1)
  expect(await svg.locator('[data-person-id]').count()).toBeGreaterThan(initialCount)
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  await svg.locator('[data-person-id="I27"]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/vertical\/I27$/)
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I1$/)
  await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(1)
  await expect(branch).toHaveAttribute('aria-expanded', 'true')
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  await branch.focus()
  await page.keyboard.press('Space')
  await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(0)
  await expect(branch).toHaveAttribute('aria-expanded', 'false')
  await expect(svg.locator('[data-person-id]')).toHaveCount(initialCount)
  await page.screenshot({ path: testInfo.outputPath('vertical-branches.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('вся родина: 74 унікальні картки, всі зв’язки, докази й незалежний PNG', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto('/vertical/I1')
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await expect(svg.locator('[data-person-id]')).toHaveCount(74)
  await expect(svg.locator('[data-relationship-id]')).toHaveCount(118)
  await expect(page.getByTestId('relatives-count')).toContainText('74 із 74')
  expect(await svg.evaluate(element => {
    const viewport = element.getBoundingClientRect()
    const nodes = [...element.querySelectorAll('[data-person-id]')]
    return new Set(nodes.map(n => n.getAttribute('data-person-id'))).size === 74 && nodes.every(node => {
      const box = node.getBoundingClientRect()
      return box.left >= viewport.left - 1 && box.right <= viewport.right + 1
        && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1
    })
  })).toBe(true)
  const link = svg.locator('[data-relationship-id]').last()
  const relationshipId = await link.getAttribute('data-relationship-id')
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', relationshipId!)
  await page.getByRole('button', { name: 'Зняти вибір зв’язку', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('vertical-all.png'), fullPage: true })
  const save = async (name: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
    const download = await pending
    await download.saveAs(testInfo.outputPath(name))
    return readFileSync((await download.path())!)
  }
  const original = await save('vertical-all-full.png')
  expect(original.subarray(1, 4).toString()).toBe('PNG')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  expect((await save('vertical-all-zoomed.png')).equals(original)).toBe(true)
  await svg.locator('[data-center="true"]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/person\/I1$/)
  await page.getByRole('button', { name: '← Назад', exact: true }).click()
  await expect(svg.locator('[data-person-id]')).toHaveCount(74)
  await expect(page.getByRole('button', { name: 'Початкові гілки', exact: true })).toHaveAttribute('aria-pressed', 'true')
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('vertical-all-320.png'), fullPage: true })
  }
  await page.getByRole('button', { name: 'Початкові гілки', exact: true }).click()
  expect(await svg.locator('[data-person-id]').count()).toBeLessThan(74)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('100%')
})
