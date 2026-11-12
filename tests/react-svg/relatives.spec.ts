import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import family from '../../generated/family.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'
import { buildFamilyGraph } from '../../src/graph/projection'
import { projectVerticalFamily } from '../../src/graph/vertical-projection'

const graph = buildFamilyGraph(familyDataSchema.parse(family))
const expanded = [...graph.personIds]
const full = (id: string) => projectVerticalFamily(graph, id, { generations: 12, expandedSiblingPersonIds: expanded })

test('біля Степана й Василя немає зайвих стрілок розгорнутої гілки Марії', async ({ page }, testInfo) => {
  await page.goto('/relatives/I32')
  const maria = page.locator('[data-sibling-person-id="I32"]')
  const brothers = page.locator('[data-person-id="I107"], [data-person-id="I108"]')
  const extraArrows = page.locator('[data-sibling-person-id="I107"], [data-sibling-person-id="I108"]')
  await expect(maria).toHaveAttribute('aria-expanded', 'true')
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

test('Усі Родичі New відкриває повну портретну діаграму', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(120_000)
  await page.goto('/vertical-design/I1')
  const tab = page.getByRole('link', { name: 'Усі Родичі New', exact: true })
  await tab.click()
  await expect(tab).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveURL(/\/relatives\/I1$/)
  await expect(page).toHaveTitle(/Усі Родичі New$/)

  const svg = page.getByRole('group', { name: /^Усі Родичі New:/ })
  const cards = svg.locator('[data-person-id]')
  await expect(page.locator('[data-card-design="portrait"]')).toHaveAttribute('data-card-density', 'full')
  await expect(svg.locator('[data-card-portrait]')).not.toHaveCount(0)
  await expect(cards).toHaveCount(full('I1').appearances.length)
  expect(await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-person-id')).sort()))
    .toEqual(full('I1').appearances.map(person => person.personId).sort())
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
  expect(png.suggestedFilename()).toBe('rodovid-relatives-I1.png')
  expect(readFileSync((await png.path())!).subarray(1, 4).toString()).toBe('PNG')
})

test('стрілки згортаються незалежно й новий центр відкриває всі гілки', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/relatives/I74')
  const svg = page.getByRole('group', { name: /^Усі Родичі New:/ })
  await expect(svg).toBeVisible({ timeout: 20_000 })
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
  await expect(page).toHaveURL(/\/relatives\/I8$/)
  await expect(cards).toHaveCount(full('I8').appearances.length)
  await expect(svg.locator('[aria-expanded="false"]')).toHaveCount(0)
  await page.goBack()
  await expect(sibling).toHaveAttribute('aria-expanded', 'false')
  await toggle(sibling)
  await expect(cards).toHaveCount(initialCount)
})


test('копія має ті самі координати карток і ліній, що повністю розгорнутий оригінал', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/vertical-design/I1')
  await expect(page.locator('[data-person-id="I1"]')).toBeVisible({ timeout: 30_000 })
  await page.evaluate(ids => {
    const key = 'rodovid:view-session:v1'
    const saved = JSON.parse(sessionStorage.getItem(key)!)
    saved.state.current.map = { ...saved.state.current.map, generations: 12, expandedSiblingIds: ids, collapsedAncestorIds: [], collapsedAppearanceIds: [] }
    sessionStorage.setItem(key, JSON.stringify(saved))
  }, expanded)
  await page.reload()
  await expect(page.locator('[data-person-id]')).toHaveCount(full('I1').appearances.length, { timeout: 30_000 })
  const geometry = () => page.locator('[data-layer="layout"]').evaluate(node => ({
    cards: [...node.querySelectorAll<SVGGElement>('[data-person-id]')].map(card => {
      const box = card.getBBox()
      return { id: card.getAttribute('data-person-id'), x: box.x, y: box.y, width: box.width, height: box.height }
    }),
    lines: [...node.querySelectorAll('[data-relationship-id]')].map(edge => ({ id: edge.getAttribute('data-relationship-id'), path: edge.querySelector('path')!.getAttribute('d') })),
  }))
  const original = await geometry()
  await page.getByRole('link', { name: 'Усі Родичі New', exact: true }).click()
  await expect(page).toHaveURL(/\/relatives\/I1$/)
  const copy = await geometry()
  expect(copy.lines).toEqual(original.lines)
  expect(copy.cards).toEqual(original.cards)
})
