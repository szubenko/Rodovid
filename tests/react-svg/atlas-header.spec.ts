import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { familyDataSchema } from '../../src/data/schema'
import { personFullName, personName } from '../../src/data/person-name'
import { tooltipLifeYears } from '../../src/graph/person-tooltip-data'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))
const anna = family.people.find(person => person.externalIds.some(id => id.system === 'FamilySearch' && id.value === 'PFJ2-SRZ'))!

test('шапка доповнює коротке ім’я по батькові, зберігаючи імена на діаграмах', async ({ page }, testInfo) => {
  for (const personId of ['I8', 'I5']) {
    const headingName = personFullName(family, personId)
    const diagramName = personName(family, personId)
    if (personId === 'I8') expect(headingName).toContain('Олександрович')
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
      const years = tooltipLifeYears(family, personId).replaceAll(' - ', '–')
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
      await expect(page.locator('header').filter({ hasNot: page.getByRole('heading', { level: 1 }) })).toHaveCount(0)
      await expect(page.getByRole('navigation', { name: /breadcrumb|хлібні крихти/i })).toHaveCount(0)
      const header = heading.locator('xpath=ancestor::header')
      await expect(header.getByRole('link', { name: 'До мене', exact: true })).toBeVisible()
      await expect(header).toHaveCSS('background-image', 'none')
      expect(original[1]!.y).toBeLessThan(width > 760 ? 1 : 56)
      if (width >= 1100 && personId === 'I1') {
        expect(original[1]!.height).toBeLessThanOrEqual(64)
        const yearBox = await header.getByText(years, { exact: true }).boundingBox()
        expect(yearBox!.x).toBeGreaterThanOrEqual(original[2]!.x + original[2]!.width)
        expect(yearBox!.y).toBeLessThan(original[2]!.y + original[2]!.height)
      }
      expect(original[3]!.y - original[1]!.y - original[1]!.height).toBeLessThanOrEqual(8)
      for (const [screen, label] of [
        ['horizontal', 'Горизонтальний родовід'], ['vertical', 'Вертикальний родовід'],
        ['vertical-design', 'Вертикальний · новий дизайн'], ['vertical-minimal', 'Вертикальна мінімальна'],
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

test('брендинг і всі дії бічної панелі доступні, мобільне меню згортається після переходу', async ({ page, isMobile }, testInfo) => {
  await page.goto('/vertical-minimal/I8')
  const sidebar = page.getByRole('complementary')
  const menu = sidebar.locator('details').first()
  const toggle = menu.locator('summary').first()
  if (isMobile) {
    await expect(menu).not.toHaveAttribute('open')
    await toggle.focus()
    await page.keyboard.press('Enter')
    await expect(menu).toHaveAttribute('open', '')
  } else {
    await expect(menu).toHaveAttribute('open', '')
    await expect(toggle).toBeHidden()
    expect((await sidebar.boundingBox())!.width).toBe(220)
  }
  await expect(sidebar.getByRole('link', { name: 'Родовід СІМЕЙНИЙ АТЛАС' })).toBeVisible()
  await expect(sidebar.getByText(family.config.title, { exact: true })).toBeVisible()
  await expect(sidebar.getByText('Наше коріння', { exact: true })).toBeVisible()
  await expect(sidebar.getByText('Звук · вимкнено', { exact: true })).toBeVisible()
  const search = sidebar.getByRole('searchbox', { name: 'Пошук людей' })
  await search.fill('Наталия Заприса')
  await sidebar.getByRole('link', { name: /Наталия Заприса/ }).click()
  await expect(page).toHaveURL('/vertical-minimal/I6')
  if (isMobile) {
    await expect(menu).not.toHaveAttribute('open')
    await toggle.click()
  }
  await expect(search).toHaveValue('Наталия Заприса')
  await search.fill('')
  if (isMobile) await toggle.click()
  const home = page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене' })
  await home.click()
  await expect(page).toHaveURL('/tree/I1')
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
  await page.screenshot({ path: testInfo.outputPath('compact-atlas.png') })
})
