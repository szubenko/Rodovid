import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { familyDataSchema } from '../../src/data/schema'
import { buildFamilyGraph, projectFamily } from '../../src/graph/projection'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))
const graph = buildFamilyGraph(family)

test('home renders the approved real projection and supports keyboard sector navigation', async ({ page }) => {
  await page.goto('/')
  const map = page.getByRole('region', { name: 'Радіальна карта родини', exact: true })
  await expect(map.locator('svg [data-person-id]')).toHaveCount(5)
  await expect(map.locator('[data-center="true"]')).toHaveAttribute('data-person-id', 'I1')
  await expect(map.locator('[data-center="true"]')).toContainText('нар. 1987')
  await expect(map.locator('img, image')).toHaveCount(0)
  const node = map.locator('svg [data-person-id="I2"]')
  await node.focus()
  await expect(node).toBeFocused()
  expect(await node.locator('path').first().evaluate((element) => getComputedStyle(element).strokeWidth)).toBe('5px')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/tree\/I2$/)
  await expect(map.locator('[data-center="true"]')).toHaveAttribute('data-person-id', 'I2')
  await map.locator('[data-center="true"]').focus()
  await page.keyboard.press('Space')
  await expect(page).toHaveURL(/\/person\/I2$/)
})

test('touch or mouse selects a concrete line and keyboard can clear or select it', async ({ page, isMobile }) => {
  await page.goto('/tree/I1')
  const edge = page.locator('svg [data-relationship-id]').first()
  const id = await edge.getAttribute('data-relationship-id')
  const path = edge.locator('path').first()
  await expect(path).toHaveCSS('stroke-width', '24px')
  await path.scrollIntoViewIfNeeded()
  const position = await path.evaluate((element) => {
    const path = element as SVGPathElement
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!)
    return { x: point.x, y: point.y }
  })
  if (isMobile) await page.touchscreen.tap(position.x, position.y)
  else await page.mouse.click(position.x, position.y)
  const details = page.getByTestId('relationship-details')
  await expect(details).toHaveAttribute('data-relationship-id', id!)
  await expect(edge).toHaveAttribute('aria-pressed', 'true')
  await expect(details).toContainText('Не оцінено')
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await page.getByRole('button', { name: 'Зняти вибір зв’язку' }).click()
  await expect(details).toHaveCount(0)
  await edge.focus()
  await page.keyboard.press('Space')
  await expect(details).toHaveAttribute('data-relationship-id', id!)
  await page.getByRole('link', { name: 'Увійти до кімнати', exact: true }).click()
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(details).toHaveAttribute('data-relationship-id', id!)
})

test('disputed roles and duplicate families keep distinct selectable relationships', async ({ page }) => {
  for (const personId of ['I9', 'I20']) {
    await page.goto(`/tree/${personId}`)
    await page.getByText(/^Зв’язки на карті ·/).click()
    const buttons = page.locator('button[data-relationship-id]')
    const expected = [...new Set(projectFamily(graph, personId).edges.map((edge) => edge.relationshipId))]
    await expect(buttons).toHaveCount(expected.length)
    for (const button of await buttons.all()) {
      const id = await button.getAttribute('data-relationship-id')
      await button.click()
      await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', id!)
      await expect(button).toHaveAttribute('aria-pressed', 'true')
      const relation = graph.relationships.get(id!)!
      if (relation.explanation) await expect(page.getByTestId('relationship-details')).toContainText(relation.explanation)
      const size = await button.boundingBox()
      expect(size!.height).toBeGreaterThanOrEqual(44)
      expect(size!.width).toBeGreaterThanOrEqual(44)
    }
  }
})

test('all real centers fit the phone and desktop with full names and stable relationship IDs', async ({ page }, testInfo) => {
  test.setTimeout(90_000)
  for (const width of [320, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    for (const person of family.people) {
      await page.goto(`/tree/${person.id}`)
      const projection = projectFamily(graph, person.id)
      await expect(page.locator('svg [data-person-id]')).toHaveCount(projection.appearances.length)
      expect(await page.locator('svg [data-relationship-id]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-relationship-id'))))
        .toEqual(projection.edges.map((edge) => edge.relationshipId))
      expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(width)
      expect(await page.locator('text[data-label-width]').evaluateAll((elements) => elements.filter((element) =>
        (element as SVGTextElement).getComputedTextLength() > Number(element.getAttribute('data-label-width')) + 0.5).length)).toBe(0)
      const names = page.getByRole('region', { name: 'Радіальна карта родини', exact: true }).locator('details[open] a')
      await expect(names).toHaveCount(new Set(projection.appearances.map((node) => node.personId)).size)
      if (['I1', 'I9', 'I20'].includes(person.id)) {
        await page.screenshot({ path: testInfo.outputPath(`${person.id}-${width}.png`), fullPage: true })
        await page.locator('svg').screenshot({ path: testInfo.outputPath(`${person.id}-${width}-map.png`) })
      }
    }
  }
})

test('a person without names, dates, photos or relationships remains usable', async ({ page }) => {
  const minimal = familyDataSchema.parse({ ...family, people: [family.people[0]], claims: [], events: [], relationships: [], media: [] })
  await page.route('**/data/family.json', (route) => route.fulfill({ json: minimal }))
  await page.goto('/')
  await expect(page.locator('svg [data-person-id]')).toHaveCount(1)
  await expect(page.locator('svg [data-center="true"]')).toHaveAccessibleName(/Ім’я невідоме. Роки життя невідомі/)
  await expect(page.locator('svg')).not.toContainText(/undefined|null|NaN/)
  await page.getByText(/^Зв’язки на карті ·/).click()
  await expect(page.getByText('Для цього показу зв’язків немає.')).toBeVisible()
})
