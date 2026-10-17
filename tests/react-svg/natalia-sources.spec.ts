import { expect, test } from '@playwright/test'
import type { FamilyData } from '../../src/data/schema'

test('Natalia’s sources appear under the four relevant events and not her death', async ({ page }, info) => {
  const response = await page.request.get('/data/family.json')
  const family = await response.json() as FamilyData
  const personId = family.people.find(person => person.externalIds.some(id => id.value === 'PFFS-2YZ'))!.id
  await page.goto(`/person/${personId}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Наталія Семенівна Заприса')
  for (const [recordId, kind, ark] of [
    ['@I39@', 'birth', '6X32-NT61'],
    ['@F15@', 'marriage', '6XST-5XK9'],
    ['@I41@', 'birth', '6X3L-JXHD'],
    ['@I50@', 'birth', '6X37-6N4T'],
  ]) {
    const event = family.events.find(event => event.kind === kind && event.provenance.some(origin => origin.kind === 'gedcom' && origin.recordId === recordId))!
    const block = page.locator(`[data-timeline-id="${event.id}"]`)
    await block.getByText('Джерело', { exact: true }).click()
    await expect(block.locator('[data-source-id]')).toHaveCount(1)
    await expect(block.locator('[data-source-id]')).toContainText(ark!)
    const source = block.locator('[data-source-id]')
    if (kind === 'birth' && recordId === '@I39@') {
      await expect(source).toContainText('Собственникъ Симеонъ Григоріевъ Заприса, и законная жена его Евдокія Аврамова; оба православные.')
      await expect(source.locator('img')).toBeVisible()
      await expect(source).not.toContainText('Скриншот запису ще не додано.')
    }
    await expect(source).not.toContainText('Дата:')
    await expect(source).not.toContainText('Тип події:')
    await expect(source.getByRole('link', { name: new RegExp(ark!) })).toHaveAttribute('href', `https://familysearch.org/ark:/61903/1:1:${ark}`)
    await expect(source.getByText('Опис', { exact: true })).toBeVisible()
    await expect(source.getByText('Текст запису (опис)', { exact: true })).toHaveCount(0)
    await expect(source.getByText('Скриншот запису', { exact: true })).toHaveCount(0)
    const sourceTitle = family.sources.find(item => item.id === family.evidenceLinks.find(link => link.target.kind === 'event' && link.target.id === event.id)!.sourceId)!.title
    await expect(source).not.toContainText(sourceTitle)
    await expect(source).not.toContainText('Метадані експорту')
    await expect(source).not.toContainText('OBJE.FILE')
  }
  const death = family.events.find(event => event.kind === 'death' && event.participants.some(person => person.personId === personId))!
  const deathBlock = page.locator(`[data-timeline-id="${death.id}"]`)
  await expect(deathBlock).toContainText('грудень 1980')
  await expect(deathBlock.locator('summary')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('natalia-sources.png'), fullPage: true })
})
