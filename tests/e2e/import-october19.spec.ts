import { expect, test } from '@playwright/test'
import type { FamilyData } from '../../src/data/schema'

test('the new indexed birth source shares the approved scan and transcript', async ({ page }, info) => {
  await page.setViewportSize({ width: info.project.name.includes('mobile') ? 320 : 1280, height: 900 })
  const family = await (await page.request.get('/data/family.json')).json() as FamilyData
  const person = family.people.find(p => p.externalIds.some(id => id.value === 'PNKZ-DMH'))!
  const birth = family.events.find(e => e.kind === 'birth' && e.participants.some(p => p.personId === person.id))!
  await page.goto(`/person/${person.id}`)
  const source = page.locator(`[data-source-for="${birth.id}"]`)
  await source.locator('summary').click()
  await expect(source.locator('img')).toHaveCount(1)
  await expect(source.locator('blockquote')).toHaveCount(1)
  await expect(source.locator('blockquote')).toContainText('Николай. Родился 9 мая 1883 года')
  await expect(source).not.toContainText('_RIN')
  for (const ark of ['6X32-HYTL', '6X32-HYT5', '6X32-CJKT']) await expect(source.locator(`a[href$="${ark}"]`)).toHaveCount(1)
  await expect.poll(() => source.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await source.screenshot({ path: info.outputPath('nikolay-new-source.png') })
})

test('Alexander shows the approved shared death scan and description with both indexed links', async ({ page }, info) => {
  const family = await (await page.request.get('/data/family.json')).json() as FamilyData
  const person = family.people.find(p => p.externalIds.some(id => id.value === 'PN26-LCG'))!
  const death = family.events.find(e => e.kind === 'death' && e.participants.some(p => p.personId === person.id))!
  await page.goto(`/person/${person.id}`)
  await expect(page.locator('body')).toContainText('2 березня 1907')
  const source = page.locator(`[data-source-for="${death.id}"]`)
  await source.locator('summary').click()
  await expect(source.locator('img')).toHaveCount(1)
  await expect(source.locator('blockquote')).toHaveCount(1)
  await expect(source.locator('blockquote')).toHaveText('Александръ, сынъ села Чеплеевки кр. собственника Симеона Григоріева Заприса. Умеръ 2 марта, погребенъ 3 марта. Возрастъ — 11 лѣтъ. Запись № 10.')
  await expect.poll(() => source.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  await expect(source).not.toContainText('_RIN')
  for (const ark of ['6X39-QQXZ', '6X39-QQXF']) await expect(source.locator(`a[href$="${ark}"]`)).toHaveCount(1)
  const missing = source.getByText('Скриншот запису ще не додано.', { exact: true })
  await expect(missing).toHaveCount(0)
  await source.screenshot({ path: info.outputPath('alexander-death-saved-source.png') })
})

test('Timofey shows the corrected 1880 death date and the approved shared act', async ({ page }, info) => {
  await page.setViewportSize({ width: info.project.name.includes('mobile') ? 320 : 1280, height: 900 })
  const family = await (await page.request.get('/data/family.json')).json() as FamilyData
  const person = family.people.find(p => p.externalIds.some(id => id.value === 'PFVV-7W1'))!
  const death = family.events.find(e => e.kind === 'death' && e.participants.some(p => p.personId === person.id))!
  expect(family.claims.find(c => c.field === 'date' && c.target.id === death.id)).toMatchObject({
    id: 'claim-844bdc5dfb7b9d883e16cd81', value: { raw: '9 OCT 1880' },
  })
  await page.goto(`/person/${person.id}`)
  await expect(page.locator('body')).toContainText('9 жовтня 1880')
  const source = page.locator(`[data-source-for="${death.id}"]`)
  await source.locator('summary').click()
  await expect(source.locator('img')).toHaveCount(1)
  await expect(source.locator('blockquote')).toHaveCount(1)
  await expect(source.locator('blockquote')).toHaveText('Тимофей, сынъ козака Ѳеодора Петрова Зубенка. Умеръ 9 октября 1880 года, погребенъ 11 октября 1880 года. Возрастъ — 5 лѣтъ. Причина смерти — «Отъ Крупа». Запись № 14.')
  for (const ark of ['6X3M-TDS3', '6X3M-TDSW']) await expect(source.locator(`a[href$="${ark}"]`)).toHaveCount(1)
  await expect(source).not.toContainText('_RIN')
  await expect(source).not.toContainText('1980')
  await expect.poll(() => source.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await source.screenshot({ path: info.outputPath('timofey-death-1880-source.png') })
})
