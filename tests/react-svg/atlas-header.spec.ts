import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { familyDataSchema } from '../../src/data/schema'
import { personFullName } from '../../src/data/person-name'
import { tooltipLifeYears } from '../../src/graph/person-tooltip-data'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))
const anna = family.people.find(person => person.externalIds.some(id => id.system === 'FamilySearch' && id.value === 'PFJ2-SRZ'))!

test('шапка доповнює коротке ім’я по батькові, зберігаючи імена на діаграмах', async ({ page }, testInfo) => {
  for (const [personId, headingName, diagramName] of [
    ['I8', 'Петро Олександрович Дейкало', 'Петро Дейкало'],
    ['I5', 'Яков Макарович Зубенко', 'Яков Макарович Зубенко'],
  ]) {
    for (const screen of ['tree', 'horizontal', 'vertical', 'relatives', 'person']) {
      await page.goto(`/${screen}/${personId}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(headingName!)
      if (screen !== 'person') {
        const person = page.locator(`svg [data-person-id="${personId}"]`).first()
        await expect(person).toHaveAttribute('aria-label', new RegExp(diagramName!))
        expect((await person.locator('text').allTextContents()).join(' ')).toContain(diagramName!)
        if (personId === 'I8') await expect(person).not.toContainText('Олександрович')
      }
      if (personId === 'I8' && ['tree', 'person'].includes(screen)) {
        await page.screenshot({ path: testInfo.outputPath(`petro-heading-${screen}.png`) })
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
  }
})

test('повне ім’я Наталії показане лише у верхньому заголовку', async ({ page }) => {
  for (const screen of ['tree', 'person']) {
    await page.goto(`/${screen}/I6`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Наталія Семенівна Заприса')
    await expect(page.locator('aside')).toContainText('Наталия Заприса')
    await expect(page.locator('aside')).not.toContainText('Семенівна')
    if (screen === 'tree') {
      const person = page.locator('svg [data-person-id="I6"]').first()
      await expect(person).toHaveAttribute('aria-label', /Наталия Заприса/)
      await expect(person).not.toHaveAttribute('aria-label', /Семенівна/)
    }
  }
})

test('шапка й вкладки не зміщуються між усіма діаграмами та історією життя', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(120_000)
  expect(anna).toBeDefined()
  const widths = isMobile ? [760, 412, 320] : [1920, 1440, 1100, 1024, 761]
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    for (const personId of ['I1', anna.id]) {
      await page.goto(`/tree/${personId}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByLabel('Перегляд людини', { exact: true })).toBeVisible()
      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toHaveText(personFullName(family, personId))
      const years = tooltipLifeYears(family, personId)
      if (years) await expect(heading.locator('..').getByText(years, { exact: true })).toBeVisible()
      const boxes = () => page.evaluate(() => {
        const heading = document.querySelector('main h1')!
        const elements = [document.querySelector('header')!, heading.closest('header')!, heading,
          document.querySelector('[aria-label="Перегляд людини"]')!]
        return elements.map(element => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y: y + scrollY, width, height, fontSize: getComputedStyle(element).fontSize }
        })
      })
      const original = await boxes()
      for (const [screen, label] of [
        ['horizontal', 'Горизонтальний родовід'], ['vertical', 'Вертикальний родовід'],
        ['relatives', 'Усі родичі'], ['person', 'Історія життя'], ['tree', 'Родинне коло'],
      ]) {
        await page.getByRole('link', { name: label!, exact: true }).click()
        await expect(page).toHaveURL(new RegExp(`/${screen}/${personId}$`))
        const current = await boxes()
        for (const [index, box] of current.entries()) {
          expect(box.fontSize).toBe(original[index]!.fontSize)
          for (const key of ['x', 'y', 'width', 'height'] as const) {
            expect(Math.abs(box[key] - original[index]![key]), `${width}px ${personId} ${screen} element ${index} ${key}`).toBeLessThan(0.5)
          }
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        if (screen === 'person') {
          await expect(heading).toHaveText(personFullName(family, personId))
          await expect(page.getByRole('heading', { name: 'Життєпис', exact: true })).toHaveCount(0)
          await expect(page.locator('#biography > header')).toHaveCount(0)
          await expect(page.getByRole('region', { name: 'Відомості', exact: true })).toBeVisible()
          await expect(page.getByRole('region', { name: 'Біографічні події', exact: true })).toBeVisible()
          await expect(page.getByRole('navigation', { name: 'Розділи кімнати' })).toHaveCount(0)
          await expect(page.getByRole('link', { name: 'Показати на карті', exact: true })).toHaveCount(0)
        }
        if (personId === anna.id && (screen === 'person' || screen === 'tree')) {
          await page.screenshot({ path: testInfo.outputPath(`header-${width}-${screen}.png`) })
        }
      }
    }
  }
})
