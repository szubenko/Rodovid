import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import family from '../../generated/family.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'
import { buildFamilyGraph } from '../../src/graph/projection'
import { projectAllRelatives } from '../../src/graph/all-relatives-projection'

const graph = buildFamilyGraph(familyDataSchema.parse(family))
const full = (id: string) => projectAllRelatives(graph, id)

test('біля Степана й Василя немає зайвих стрілок розгорнутої гілки Марії', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/relatives-2/I32')
  const maria = page.locator('[data-sibling-person-id="I32"]')
  const brothers = page.locator('[data-person-id="I107"], [data-person-id="I108"]')
  const extraArrows = page.locator('[data-sibling-person-id="I107"], [data-sibling-person-id="I108"]')
  await expect(maria).toHaveAttribute('aria-expanded', 'true', { timeout: 60_000 })
  await expect(brothers).toHaveCount(2)
  await expect(extraArrows).toHaveCount(0)
  await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
  await expect(extraArrows).toHaveCount(0)
  await maria.focus()
  await page.keyboard.press('Enter')
  await expect(maria).toHaveAttribute('aria-expanded', 'false')
  await expect(brothers).toHaveCount(0)
  await maria.focus()
  await page.keyboard.press('Enter')
  await expect(maria).toHaveAttribute('aria-expanded', 'true')
  await expect(brothers).toHaveCount(2)
  await expect(extraArrows).toHaveCount(0)
  await page.reload()
  await expect(maria).toHaveAttribute('aria-expanded', 'true')
  await expect(extraArrows).toHaveCount(0)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('maria-sibling-arrows.png'), fullPage: true })
})

test('Всі Родичі 2 відкриває повну портретну діаграму', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/vertical-design/I1')
  const tab = page.getByRole('link', { name: 'Всі Родичі 2', exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveURL(/\/relatives-2\/I1$/)
  await expect(page).toHaveTitle(/Всі Родичі 2$/)

  const svg = page.getByRole('group', { name: /^Всі Родичі 2:/ })
  const cards = svg.locator('[data-person-id]')
  await expect(page.locator('[data-card-design="portrait"]')).toHaveAttribute('data-card-density', 'full')
  await expect(svg.locator('[data-card-portrait]')).not.toHaveCount(0)
  await expect(cards).toHaveCount(family.people.length)
  expect(await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-person-id')).sort()))
    .toEqual(family.people.map(person => person.id).sort())
  await expect(svg.locator('[data-relationship-id]')).toHaveCount(full('I1').edges.length)
  await expect(svg.locator('[data-sibling-person-id]')).not.toHaveCount(0)
  await expect(svg.locator('[data-ancestor-person-id]')).not.toHaveCount(0)
  await expect(svg.locator('[aria-expanded="false"]')).toHaveCount(0)

  for (const density of ['full', 'compact']) {
    if (density === 'compact') await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
    await expect(page.locator('[data-card-design="portrait"]')).toHaveAttribute('data-card-density', density)
    expect(await cards.evaluateAll(nodes => {
      const boxes = nodes.map(node => node.querySelector('rect')!.getBoundingClientRect())
      return boxes.every((a, index) => boxes.slice(index + 1).every(b =>
        a.right <= b.left + .1 || b.right <= a.left + .1 || a.bottom <= b.top + .1 || b.bottom <= a.top + .1))
    })).toBe(true)
    const father = await svg.locator('[data-person-id="I2"] rect').first().boundingBox()
    const mother = await svg.locator('[data-person-id="I3"] rect').first().boundingBox()
    expect(father!.x).toBeLessThan(mother!.x)
  }
  if (isMobile) await page.setViewportSize({ width: 320, height: 740 })
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('all-relatives-new.png'), fullPage: true })
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  const png = await pending
  expect(png.suggestedFilename()).toBe('rodovid-relatives-2-I1.png')
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG')
})

test('стрілки згортаються незалежно й новий центр відкриває всі гілки', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/relatives-2/I74')
  const svg = page.getByRole('group', { name: /^Всі Родичі 2:/ })
  await expect(svg).toBeVisible({ timeout: 60_000 })
  const ancestor = svg.locator('[data-ancestor-person-id="I74"]')
  const sibling = svg.locator('[data-sibling-person-id="I74"]')
  const cards = svg.locator('[data-person-id]')
  const initialCount = full('I74').appearances.length
  const toggle = async (control: typeof ancestor) => {
    await control.focus()
    await page.keyboard.press('Enter')
  }
  await expect(ancestor).toHaveAttribute('aria-expanded', 'true')
  await expect(sibling).toHaveAttribute('aria-expanded', 'true')
  await toggle(ancestor)
  await expect(ancestor).toHaveAttribute('aria-expanded', 'false')
  await expect(sibling).toHaveAttribute('aria-expanded', 'true')
  await expect(svg.locator('[data-person-id="I8"]')).toHaveCount(0)
  await expect(svg.locator('[data-person-id="I4"]')).toHaveCount(1)
  await toggle(ancestor)
  await expect(cards).toHaveCount(initialCount)
  await toggle(sibling)
  await expect(sibling).toHaveAttribute('aria-expanded', 'false')
  await expect(ancestor).toHaveAttribute('aria-expanded', 'true')

  await svg.locator('[data-person-id="I8"]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/relatives-2\/I8$/)
  await expect(cards).toHaveCount(full('I8').appearances.length)
  await expect(svg.locator('[aria-expanded="false"]')).toHaveCount(0)
  await page.goBack()
  await expect(sibling).toHaveAttribute('aria-expanded', 'false')
  await toggle(sibling)
  await expect(cards).toHaveCount(initialCount)
})


for (const id of ['I26', 'I125', 'I192']) test(`повний граф зберігає всіх людей після перезавантаження ${id}`, async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/relatives-2/' + id)
  await expect(page.locator('[data-person-id]')).toHaveCount(family.people.length, { timeout: 60_000 })
  await page.reload()
  await expect(page.locator('[data-person-id]')).toHaveCount(family.people.length, { timeout: 60_000 })
})
