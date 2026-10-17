import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { familyDataSchema } from '../../src/data/schema'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))
const expectedPlace = 'Чапліївка, Кролевецький повіт, Чернігівська губернія, Російська імперія'
const originalNames = new Set([
  'Chepleevka, Krolevets, Chernigov, Russian Empire',
  'Харьковская губерния, Российская империя',
  'Kharkiv Guberniya, Russian Empire',
])
const placeIds = new Set(family.places.filter(place => originalNames.has(place.originalName)).map(place => place.id))
const claims = family.claims.filter(claim => claim.field === 'place' && placeIds.has(claim.value))
const eventIds = new Set(claims.map(claim => claim.target.id))
const personIds = [...new Set(family.events.filter(event => eventIds.has(event.id))
  .flatMap(event => event.participants.map(person => person.personId)))]

for (const personId of personIds) {
  test(`${personId}: українське місце в кімнаті та попапі`, async ({ page, isMobile }, testInfo) => {
    // Hover cards are a desktop interaction; the room remains covered on mobile.
    const ownEvents = new Set(family.events.filter(event => event.participants.some(person => person.personId === personId)).map(event => event.id))
    const ownClaims = claims.filter(claim => ownEvents.has(claim.target.id))
    await page.goto(`/person/${personId}`)
    const room = page.locator('#biography')
    await expect(room).toBeVisible()
    for (const claim of ownClaims) {
      await expect(room.locator(`[data-claim-id="${claim.id}"]`)).toHaveText(`Місце: ${expectedPlace}`)
    }
    for (const raw of originalNames) await expect(room).not.toContainText(raw)
    if (personId === 'I12' && !isMobile) await page.screenshot({ path: testInfo.outputPath('place-name-room.png') })
    if (isMobile) return

    await page.goto(`/tree/${personId}`)
    await page.locator(`[data-person-id="${personId}"][data-center="true"]`).hover()
    const popup = page.getByRole('tooltip')
    await expect(popup).toHaveAttribute('data-tooltip-person-id', personId)
    for (const claim of ownClaims) {
      await expect(popup.locator(`[data-claim-id="${claim.id}"]`)).toHaveText(`Місце: ${expectedPlace}`)
    }
    for (const raw of originalNames) await expect(popup).not.toContainText(raw)
    if (personId === 'I12') await page.screenshot({ path: testInfo.outputPath('place-name-popup.png') })
  })
}
