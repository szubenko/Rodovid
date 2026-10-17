import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { familyDataSchema, type FamilyData } from '../data/schema'
import { FamilyContext } from '../navigation/context'
import { ViewProvider } from '../navigation/Providers'
import { biographyTimeline, personOccupationEvents, personStatusEvents, tooltipTimeline, tooltipTimelineYear } from '../graph/person-tooltip-data'
import { LifeBiography } from './LifeBiography'
import fixture from '../../tests/fixtures/data-contract/full.json'

function renderBiography(family: FamilyData) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={['/person/I1']}>
    <FamilyContext value={family}><ViewProvider><LifeBiography personId="I1" /></ViewProvider></FamilyContext>
  </MemoryRouter>)
}

describe('complete biography', () => {
  it('retains every personal claim, source event, raw value, explanation and evidence while moving status out of the timeline', () => {
    const family = familyDataSchema.parse(fixture)
    const provenance = family.people[0]!.provenance
    family.people[0]!.sex = 'M'
    family.people[0]!.lifeStatus = 'deceased'
    family.claims.push({ ...family.claims[0]!, id: 'alternative-name', field: 'name', target: { kind: 'person', id: 'I1' },
      value: { raw: 'Alternate /Name/', display: 'Alternate Name', prefix: 'Пані', language: 'uk' },
      isPrimary: false, explanation: 'Пояснення альтернативного написання' })
    family.claims.push({ id: 'personal-note', field: 'description', target: { kind: 'person', id: 'I1' },
      value: 'Повний опис життя', isPrimary: false, confidence: 'hypothesis', provenance })
    for (const [id, kind, label] of [['death', 'death', undefined], ['empty-record', 'residence', undefined],
      ['status', 'other', 'Caste Name'], ['occupation', 'other', 'OCCU'], ['empty-occupation', 'other', 'Заняття']] as const) {
      family.events.push({ ...family.events[0]!, id, kind, label })
    }
    family.claims.push({ id: 'unknown-death', field: 'date', target: { kind: 'event', id: 'death' },
      value: { kind: 'unknown', raw: 'DECEASED' }, isPrimary: false, confidence: 'unassessed', provenance })
    family.claims.push({ id: 'death-note', field: 'description', target: { kind: 'event', id: 'death' },
      value: 'В оригінальному експорті: DATE DECEASED; точна дата смерті невідома.', isPrimary: false, confidence: 'unassessed', provenance })
    family.claims.push({ id: 'status-claim', field: 'description', target: { kind: 'event', id: 'status' },
      value: 'козак', isPrimary: true, confidence: 'probable', explanation: 'Стан зазначений у джерелі', provenance })
    family.claims.push({ id: 'occupation-description', field: 'description', target: { kind: 'event', id: 'occupation' },
      value: 'Гончар', isPrimary: true, confidence: 'unassessed', explanation: 'Заняття зазначене в документі', provenance })
    family.claims.push({ id: 'occupation-date', field: 'date', target: { kind: 'event', id: 'occupation' },
      value: { kind: 'point', raw: '6 AUG 1929', calendar: 'unspecified', qualifier: 'exact', value: { precision: 'day', year: 1929, month: 8, day: 6 } },
      isPrimary: true, confidence: 'unassessed', provenance })
    family.evidenceLinks.push({ ...family.evidenceLinks[0]!, id: 'occupation-evidence', target: { kind: 'event', id: 'occupation' } })
    const before = structuredClone(family)
    const html = renderBiography(family)
    const expectedClaims = family.claims.filter(claim => claim.target.id === 'I1'
      || family.events.some(event => event.id === claim.target.id && event.participants.some(person => person.personId === 'I1')))
    expect([...html.matchAll(/data-claim-id="([^"]+)"/g)].map(match => match[1]).sort())
      .toEqual(expectedClaims.map(claim => claim.id).sort())
    expect([...html.matchAll(/data-claim-details-id="([^"]+)"/g)].map(match => match[1]).sort())
      .toEqual(expectedClaims.map(claim => claim.id).sort())
    expect([...html.matchAll(/data-event-id="([^"]+)"/g)].map(match => match[1]).sort())
      .toEqual(family.events.map(event => event.id).sort())
    for (const value of ['Alternate Name', 'Alternate /Name/', 'Пані', 'Пояснення альтернативного написання', 'Повний опис життя',
      'DATE DECEASED', 'точна дата смерті невідома', 'Стан зазначений у джерелі', 'Козак Тестова Особа',
      'fixture-profile', 'example-1', 'Докази події', 'Не оцінено', 'близько']) {
      expect(html).toContain(value)
    }
    expect(html).toContain(family.media.find(media => media.id === 'media-scan')!.title)
    expect(html).toContain(`data-source-id="${family.sources[0]!.id}"`)
    expect(html).toContain('href="/person/I2"')
    expect(personStatusEvents(family, 'I1').map(event => event.id)).toEqual(['status'])
    expect(personOccupationEvents(family, 'I1').map(event => event.id)).toEqual(['occupation', 'empty-occupation'])
    const facts = html.match(/aria-label="Відомості">([\s\S]*?)<\/section>/)![1]!
    expect(facts).not.toContain('Стать у записі')
    expect(facts).not.toContain('У даних є відомості про смерть')
    expect(facts).not.toContain('Оцінка, джерела й походження')
    expect(facts).not.toContain('data-claim-details-id=')
    expect(html).toContain('Стать у записі: чоловіча.')
    expect(html).toContain('У даних є відомості про смерть.')
    expect(facts).toContain('Alternate Name')
    expect(facts).not.toContain('Alternate /Name/')
    expect(facts).not.toContain('Пояснення альтернативного написання')
    expect(facts).not.toContain('6 AUG 1929')
    expect(html).toContain('Запис у джерелі: 6 AUG 1929')
    const events = html.match(/aria-label="Біографічні події">([\s\S]*?)<\/section>/)![1]!
    expect(events).toContain('Оцінка, джерела й походження')
    const dateBeforeDetails = html.split('id="claim-claim-date-alt"')[1]!.split('<details')[0]!
    expect(dateBeforeDetails).toContain('близько 1876')
    expect(dateBeforeDetails).not.toContain('Запис у джерелі')
    for (const value of ['Гончар', 'Заняття:', '6 серпня 1929', 'Заняття зазначене в документі',
      'data-event-id="occupation"', 'data-event-id="empty-occupation"', 'data-evidence-id="occupation-evidence"']) {
      expect(facts).toContain(value)
    }
    expect(biographyTimeline(family, 'I1').some(entry => ['occupation', 'empty-occupation'].includes(entry.id))).toBe(false)
    expect(tooltipTimeline(family, 'I1').map(entry => entry.id)).toContain('occupation')
    expect(biographyTimeline(family, 'I1').map(entry => entry.id)).toContain('empty-record')
    expect(biographyTimeline(family, 'I1').map(entry => entry.id)).not.toContain('status')
    expect(tooltipTimeline(family, 'I1').map(entry => entry.id)).not.toContain('death')
    expect(family).toEqual(before)
  })

  it('orders family events, preserves duplicate marriages and leaves relationship-only entries undated', () => {
    const family = familyDataSchema.parse(fixture)
    const provenance = family.people[0]!.provenance
    family.people.push({ ...family.people[0]!, id: 'I3', sex: 'F' }, { ...family.people[0]!, id: 'I4', sex: 'M' })
    family.claims.push({ ...family.claims[0]!, id: 'child-name', field: 'name', target: { kind: 'person', id: 'I3' },
      value: { raw: 'Донька', display: 'Донька' } })
    for (const id of ['I3', 'I4'] as const) family.relationships.push({ ...family.relationships[0]!, id: `child-${id}`,
      kind: 'parent-child', fromPersonId: 'I1', toPersonId: id })
    family.events.push({ ...family.events[1]!, id: 'second-marriage-record' })
    family.events.push({ ...family.events[0]!, id: 'child-birth', participants: [{ personId: 'I3', role: 'subject' }] })
    family.claims.push({ id: 'child-date', field: 'date', target: { kind: 'event', id: 'child-birth' }, isPrimary: false,
      confidence: 'unassessed', provenance, value: { kind: 'point', raw: '1900', calendar: 'unspecified', qualifier: 'exact', value: { precision: 'year', year: 1900 } } })
    const before = structuredClone(family)
    const timeline = biographyTimeline(family, 'I1')
    expect(timeline.map(entry => entry.id)).toEqual(['event-birth', 'event-marriage', 'second-marriage-record', 'child-birth', 'child/child-I4'])
    expect(timeline.find(entry => entry.id === 'child-birth')?.labelPersonIds).toEqual(['I3'])
    expect(timeline.filter(entry => entry.stage === 2).every(entry => tooltipTimelineYear(entry) === '')).toBe(true)
    const unknownChild = timeline.find(entry => entry.id === 'child/child-I4')!
    expect(unknownChild.event).toBeNull()
    expect(unknownChild.claims).toEqual([])
    expect(tooltipTimelineYear(unknownChild)).toBe('')
    expect(family).toEqual(before)
  })
})
