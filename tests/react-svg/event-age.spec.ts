import { expect, test } from '@playwright/test'
import { familyDataSchema, type FamilyEvent } from '../../src/data/schema'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }

test('age appears below dates for all events, including children’s births, except own birth and unknown dates', async ({ page }, info) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  const birth = family.claims.find(claim => claim.id === 'claim-date-main')!
  if (birth.field !== 'date') throw new Error('Expected birth date')
  birth.value = { kind: 'point', raw: '15 JUN 1880', calendar: 'unspecified', qualifier: 'exact',
    value: { precision: 'day', year: 1880, month: 6, day: 15 } }
  const marriage = { ...birth, id: 'marriage-date', target: { kind: 'event' as const, id: 'event-marriage' },
    value: { ...birth.value, raw: '14 JUN 1900', value: { precision: 'day' as const, year: 1900, month: 6, day: 14 } } }
  family.claims.push(marriage, { ...marriage, id: 'marriage-alternative', isPrimary: false,
    value: { ...marriage.value, raw: '15 JUN 1900', value: { ...marriage.value.value, day: 15 } } })
  const addEvent = (id: string, kind: FamilyEvent['kind'], year: number, label?: string) => {
    family.events.push({ ...family.events[0]!, id, kind, label })
    family.claims.push({ ...birth, id: `${id}-date`, target: { kind: 'event', id },
      value: { kind: 'point', calendar: 'unspecified', qualifier: 'exact', raw: `15 JUN ${year}`,
        value: { precision: 'day', year, month: 6, day: 15 } } })
  }
  family.people.push({ ...family.people[1]!, id: 'I3' })
  family.claims.push({ ...family.claims.find(claim => claim.field === 'name')!, id: 'child-name',
    target: { kind: 'person', id: 'I3' }, value: { raw: 'Тестова /Дитина/', display: 'Тестова Дитина' } })
  family.relationships.push({ ...family.relationships[0]!, id: 'parent-child', kind: 'parent-child', fromPersonId: 'I1', toPersonId: 'I3' })
  addEvent('child-birth', 'birth', 1905)
  family.events.at(-1)!.participants = [{ personId: 'I3', role: 'subject' }, { personId: 'I1', role: 'parent' }]
  addEvent('occupation', 'other', 1910, 'Заняття')
  addEvent('dated-death', 'death', 1940)
  family.events.push({ ...family.events[0]!, id: 'unknown-death', kind: 'death' })
  family.claims.push({ ...birth, id: 'unknown-death-date', target: { kind: 'event', id: 'unknown-death' }, value: { kind: 'unknown' } })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.setViewportSize({ width: info.project.name.includes('mobile') ? 320 : 1024, height: 900 })

  await page.goto('/person/I1')
  const biography = page.locator('#biography')
  const expectedAges = [['marriage-date', '19'], ['marriage-alternative', '20'],
    ['child-birth-date', '25'], ['occupation-date', '30'], ['dated-death-date', '60']]
  await expect(biography.locator('[data-event-age]')).toHaveCount(expectedAges.length)
  for (const [id, age] of expectedAges) {
    const row = biography.locator(`[data-claim-id="${id}"] > p`).first()
    await expect(row.locator('[data-event-age]')).toHaveText(`Вік ${age} років`)
    await expect(row).toContainText('Дата:')
    await row.scrollIntoViewIfNeeded()
    const dateBox = await row.locator(':scope > span').first().boundingBox()
    const ageBox = await row.locator('[data-event-age]').boundingBox()
    expect(ageBox!.x).toBe(dateBox!.x)
    expect(ageBox!.y).toBeGreaterThanOrEqual(dateBox!.y + dateBox!.height)
  }
  await expect(biography.locator('[data-event-id="event-birth"] [data-event-age], [data-event-id="unknown-death"] [data-event-age]')).toHaveCount(0)
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await biography.screenshot({ path: info.outputPath('room-event-age.png') })

  await page.goto('/tree/I1')
  await page.keyboard.press('Tab')
  await page.locator('[data-map-viewport] [data-center="true"]').focus()
  const popup = page.getByRole('tooltip')
  await expect(popup).toBeVisible()
  await expect(popup.locator('[data-event-age]')).toHaveCount(expectedAges.length)
  await expect(popup.locator('[data-event-id="event-birth"] [data-event-age], [data-event-id="unknown-death"] [data-event-age]')).toHaveCount(0)
  for (const [id, age] of expectedAges) {
    const row = popup.locator(`[data-claim-id="${id}"] > p`).first()
    await expect(row).toContainText('Дата:')
    await expect(row.locator('[data-event-age]')).toHaveText(`Вік ${age} років`)
    await row.scrollIntoViewIfNeeded()
    const dateBox = await row.locator(':scope > span').first().boundingBox()
    const ageBox = await row.locator('[data-event-age]').boundingBox()
    expect(ageBox!.x).toBe(dateBox!.x)
    expect(ageBox!.y).toBeGreaterThanOrEqual(dateBox!.y + dateBox!.height)
  }
  expect(await popup.evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(Math.ceil((await popup.boundingBox())!.width))
  await popup.screenshot({ path: info.outputPath('popup-event-age.png') })
})

test('Petro’s real room and popup show 23–24 years at Serhiy’s birth', async ({ page }, info) => {
  const response = await page.request.get('/data/family.json')
  const family = familyDataSchema.parse(await response.json())
  const birth = family.events.find(event => event.kind === 'birth'
    && event.participants.some(person => person.personId === 'I1' && person.role === 'subject'))!
  await page.setViewportSize({ width: info.project.name.includes('mobile') ? 320 : 1024, height: 900 })
  await page.goto('/person/I2')
  const event = page.locator(`#biography [data-event-id="${birth.id}"]`)
  await expect(event).toContainText('21 грудня 1987')
  await expect(event.locator('[data-event-age]')).toHaveText('Вік 23–24 роки')
  await event.screenshot({ path: info.outputPath('room-serhiy-birth-age.png') })

  await page.goto('/tree/I2')
  await page.keyboard.press('Tab')
  await page.locator('[data-map-viewport] [data-center="true"]').focus()
  const popup = page.getByRole('tooltip')
  const popupEvent = popup.locator(`[data-event-id="${birth.id}"]`)
  await expect(popupEvent.locator('[data-event-age]')).toHaveText('Вік 23–24 роки')
  await popupEvent.scrollIntoViewIfNeeded()
  await popup.screenshot({ path: info.outputPath('popup-serhiy-birth-age.png') })
})
