import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { familyDataSchema } from '../../src/data/schema'
import { buildFamilyGraph, projectFamily } from '../../src/graph/projection'
import { personName } from '../../src/data/person-name'
import { lifeYears } from '../../src/graph/presentation'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))
const graph = buildFamilyGraph(family)

test('fourth generation switches to upright radial multiline names', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto('/tree/I1')
  await page.getByLabel('Покоління', { exact: true }).selectOption('3')
  const ancestor = page.locator('svg [data-person-id="I9"][data-ring="3"]')
  await expect(ancestor.locator('[data-label-orientation="radial"]')).toBeVisible()
  await expect(ancestor.locator('textPath')).toHaveCount(0)
  await expect(ancestor).toContainText('1900')
  await expect(page.locator('svg [data-person-id="I5"] textPath').first()).toBeVisible()
  for (const id of ['I9', 'I6', 'I8', 'I7']) {
    const lines = await page.locator(`svg [data-person-id="${id}"] [data-label-kind="name"]`).allTextContents()
    expect(lines.length).toBeLessThanOrEqual(2)
    expect(lines.join(' ')).toBe(personName(family, id))
  }
  await expect(page.locator('[data-layer="empty-sectors"] text, [data-layer="empty-sectors"] title')).toHaveCount(0)
  await page.locator('svg').screenshot({ path: testInfo.outputPath('radial-labels-desktop.png') })
  await page.getByLabel('Покоління', { exact: true }).selectOption('5')
  await expect(page.locator('svg [data-ring="4"] [data-label-orientation="radial"]').first()).toBeVisible()
  await page.locator('svg').screenshot({ path: testInfo.outputPath('radial-labels-five-rings.png') })
  const beforeZoom = await ancestor.locator('[data-label-orientation="radial"]').textContent()
  const beforeWidth = (await ancestor.locator('[data-label-orientation="radial"]').boundingBox())!.width
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  expect(await ancestor.locator('[data-label-orientation="radial"]').textContent()).toBe(beforeZoom)
  expect((await ancestor.locator('[data-label-orientation="radial"]').boundingBox())!.width).toBeGreaterThan(beforeWidth)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('Покоління', { exact: true }).selectOption('3')
  await page.locator('svg').screenshot({ path: testInfo.outputPath('radial-labels-mobile.png') })
  await ancestor.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/tree\/I9$/)
})

test('home renders the approved real projection and supports keyboard sector navigation', async ({ page }) => {
  await page.goto('/')
  const map = page.getByRole('region', { name: 'Радіальна карта родини', exact: true })
  const depth = page.getByLabel('Покоління', { exact: true })
  await expect(depth).toHaveValue('6')
  await expect(depth.locator('option')).toHaveCount(6)
  expect(await map.locator('svg [data-ring]').evaluateAll((elements) => Math.max(...elements.map((element) => Number(element.getAttribute('data-ring')))))).toBe(6)
  await expect(page.getByRole('group', { name: 'Переміщення карти', exact: true })).toHaveCount(0)
  await expect(page.getByText('Предки — вгорі', { exact: false })).toHaveCount(0)
  await expect(page.getByText('Перетягуйте карту мишею', { exact: false })).toHaveCount(0)
  await expect(map.locator('svg [data-person-id]')).toHaveCount(projectFamily(graph, 'I1', { generations: 12 }).appearances.length)
  await expect(map.locator('svg [data-layer="empty-sectors"]')).toHaveText('')
  await expect(map.locator('svg [data-layer="empty-sectors"] [role], svg [data-layer="empty-sectors"] [tabindex]')).toHaveCount(0)
  await expect(map.locator('[data-center="true"]')).toHaveAttribute('data-person-id', 'I1')
  await expect(map.locator('[data-center="true"]')).toContainText('нар. 1987')
  expect(await map.locator('svg [data-label-kind]').evaluateAll((elements) =>
    new Set(elements.map((element) => getComputedStyle(element).fontSize)).size)).toBe(1)
  await expect(map.locator('svg [data-label-kind]').first()).toHaveCSS('font-size', '14px')
  await expect(map.locator('img, image')).toHaveCount(0)
  const node = map.locator('svg [data-person-id="I2"]')
  await node.focus()
  await expect(node).toBeFocused()
  expect(await node.locator('path').first().evaluate((element) => getComputedStyle(element).strokeWidth)).toBe('5px')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/tree\/I2$/)
  await expect(depth).toHaveValue('5')
  await expect(depth.locator('option')).toHaveCount(5)
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
  for (const personId of ['I8', 'I35']) {
    await page.goto(`/tree/${personId}`)
    await page.getByText(/^Зв’язки на карті ·/).click()
    const buttons = page.locator('button[data-relationship-id]')
    const expected = [...new Set(projectFamily(graph, personId, { generations: 12 }).edges.map((edge) => edge.relationshipId))]
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

for (const width of [320, 1024]) {
  test(`all real centers at ${width}px retain full names and stable relationship IDs`, async ({ page }, testInfo) => {
    // 45 page loads plus full-page captures at mobile DPR need a batch budget.
    // Individual assertions keep Playwright's normal timeout.
    test.setTimeout(180_000)
    await page.setViewportSize({ width, height: 900 })
    for (const person of family.people) {
      await page.goto(`/tree/${person.id}`)
      const projection = projectFamily(graph, person.id, { generations: 12 })
      await expect(page.locator('svg [data-person-id]')).toHaveCount(projection.appearances.length)
      expect(await page.locator('svg [data-relationship-id]').evaluateAll((elements) => elements.map((element) => element.getAttribute('data-relationship-id'))))
        .toEqual(projection.edges.map((edge) => edge.relationshipId))
      expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(width)
      expect(await page.locator('text[data-label-width]').evaluateAll((elements) => elements.filter((element) =>
        (element as SVGTextElement).getComputedTextLength() > Number(element.getAttribute('data-label-width')) + 0.5).length)).toBe(0)
      const labels = await page.locator('svg [data-person-id]').evaluateAll((elements) => elements.map((element) => ({
        id: element.getAttribute('data-person-id')!,
        name: [...element.querySelectorAll('[data-label-kind="name"]')].map((line) => line.textContent).join(' '),
        date: [...element.querySelectorAll('[data-label-kind="date"]')].map((line) => line.textContent).join(' · '),
      })))
      for (const label of labels) {
        expect(label.name).toBe(personName(family, label.id))
        const years = lifeYears(family, label.id)
        expect(label.date).toBe(years === 'Роки життя невідомі' ? '' : years)
      }
      const names = page.getByRole('region', { name: 'Радіальна карта родини', exact: true }).locator('details[open] a')
      await expect(names).toHaveCount(new Set(projection.appearances.map((node) => node.personId)).size)
      if (['I1', 'I9', 'I20'].includes(person.id)) {
        await page.screenshot({ path: testInfo.outputPath(`${person.id}-${width}.png`), fullPage: true })
        await page.locator('svg').screenshot({ path: testInfo.outputPath(`${person.id}-${width}-map.png`) })
        await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
        await page.locator('svg').screenshot({ path: testInfo.outputPath(`${person.id}-${width}-fitted.png`) })
      }
    }
  })
}

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
