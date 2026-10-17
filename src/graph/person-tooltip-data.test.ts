import { describe, expect, it } from 'vitest'
import { familyDataSchema, type Claim } from '../data/schema'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { biographyTimeline, tooltipClaimText, tooltipEventLabel, tooltipEvents, tooltipLifeYears, tooltipPersonTitle, tooltipRelatives, tooltipText, tooltipTimeline, tooltipTimelineYear } from './person-tooltip-data'
import currentData from '../../generated/family.json'

const deathNote = 'В оригінальному експорті: DATE DECEASED; точна дата смерті невідома.'

it('shows Yakov’s first marriage and Olenka before the second marriage, Nikolay and Petro without inferring dates', () => {
  const family = familyDataSchema.parse(currentData)
  family.relationships.reverse() // The explicit owner order must survive record ordering.
  const snapshot = JSON.stringify(family)
  for (const timeline of [tooltipTimeline(family, 'I5'), biographyTimeline(family, 'I5')]) {
    const relatives = timeline.filter(entry => entry.stage === 2 || entry.stage === 3)
    expect(relatives.map(entry => entry.labelPersonIds)).toEqual([['I87'], ['I10'], ['I4'], ['I27'], ['I2']])
    expect(relatives.filter(entry => entry.stage === 2).map(entry => entry.label)).toEqual(['Перший шлюб', 'Другий шлюб'])
    expect(relatives.filter(entry => entry.stage === 2).map(tooltipTimelineYear)).toEqual(['', ''])
  }
  expect(tooltipRelatives(family, 'I5').filter(relative => relative.rank === 3).map(relative => relative.otherId)).toEqual(['I87', 'I4'])
  expect(tooltipRelatives(family, 'I5').filter(relative => relative.rank === 4).map(relative => relative.otherId)).toEqual(['I10', 'I27', 'I2'])
  expect(tooltipRelatives(family, 'I4').filter(relative => relative.rank === 4).map(relative => relative.otherId)).toEqual(['I27', 'I2'])
  expect(JSON.stringify(family)).toBe(snapshot)
})

describe('person tooltip details', () => {
  it('omits an event with only an unknown date and the imported DECEASED note', () => {
    const family = familyDataSchema.parse(fixture)
    family.events = [{ ...family.events[0]!, id: 'death', kind: 'death' }]
    const provenance = family.events[0]!.provenance
    family.claims = [
      { id: 'date', field: 'date', target: { kind: 'event', id: 'death' }, value: { kind: 'unknown', raw: 'DECEASED' }, isPrimary: false, confidence: 'unassessed', provenance },
      { id: 'note', field: 'description', target: { kind: 'event', id: 'death' }, value: deathNote, isPrimary: false, confidence: 'unassessed', provenance },
    ]
    expect(tooltipEvents(family, 'I1')).toEqual([])
    expect(tooltipLifeYears(family, 'I1')).toBe('')
    const cause: Claim = { id: 'cause', field: 'cause', target: { kind: 'event', id: 'death' }, value: 'Відомості про причину смерті', isPrimary: false, confidence: 'hypothesis', provenance }
    family.claims.push(cause)
    expect(tooltipEvents(family, 'I1').map(({ claims }) => claims.map(claim => claim.id))).toEqual([['cause']])
  })

  it('keeps a known place and descriptive facts when the date is missing', () => {
    const family = familyDataSchema.parse(fixture)
    const marriage = tooltipEvents(family, 'I1').find(({ event }) => event.kind === 'marriage')!
    expect(marriage.claims.map(claim => claim.field)).toEqual(['place'])
    expect(tooltipClaimText(family, marriage.claims[0]!)).not.toBe('')
    expect(tooltipText(`${deathNote}\nОкремий відомий факт про людину.`)).toBe('Окремий відомий факт про людину.')
    expect(tooltipText('Точний день невідомий, відомий рік — 1980.')).toBe('Точний день невідомий, відомий рік — 1980.')
  })

  it('omits absent values but preserves meaningful date phrases and qualified dates', () => {
    const family = familyDataSchema.parse(fixture)
    const date = family.claims.find(claim => claim.field === 'date')!
    expect(tooltipText('Дата невідома')).toBe('')
    expect(tooltipText('Роки життя невідомі')).toBe('')
    expect(tooltipClaimText(family, { ...date, field: 'date', target: { kind: 'event', id: 'event-birth' }, value: { kind: 'phrase', calendar: 'unspecified', raw: 'DECEASED' } })).toBe('')
    expect(tooltipClaimText(family, { ...date, field: 'date', target: { kind: 'event', id: 'event-birth' }, value: { kind: 'phrase', calendar: 'unspecified', raw: 'після Великодня' } })).toContain('після Великодня')
    expect(tooltipClaimText(family, family.claims.find(claim => claim.id === 'claim-date-alt')!)).toBe('близько 1876')
  })

  it('orders parents and spouse before children, sorts children by birth, and adds known life years', () => {
    const family = familyDataSchema.parse(fixture)
    const provenance = family.people[0]!.provenance
    family.people[0]!.sex = 'M'
    family.people[1]!.sex = 'F'
    family.people.push(...(['I3', 'I4', 'I5', 'I6', 'I7'] as const).map((id, index) => ({
      id, sex: index % 2 ? 'M' as const : 'F' as const, lifeStatus: 'unknown' as const, externalIds: [], photoIds: [], provenance,
    })))
    family.relationships = [
      { id: 'child-first', kind: 'parent-child', fromPersonId: 'I1', toPersonId: 'I6' },
      { id: 'mother', kind: 'parent-child', fromPersonId: 'I3', toPersonId: 'I1' },
      { id: 'spouse', kind: 'spouse', fromPersonId: 'I2', toPersonId: 'I1' },
      { id: 'father', kind: 'parent-child', fromPersonId: 'I4', toPersonId: 'I1' },
      { id: 'child-second', kind: 'parent-child', fromPersonId: 'I1', toPersonId: 'I5' },
      { id: 'child-undated', kind: 'parent-child', fromPersonId: 'I1', toPersonId: 'I7' },
    ].map(relation => ({ ...relation, kind: relation.kind as 'spouse' | 'parent-child', reviewStatus: 'unreviewed', confidence: 'unassessed', provenance }))
    for (const [personId, kind, year] of [['I5', 'birth', 1900], ['I6', 'birth', 1905], ['I5', 'death', 1980]] as const) {
      const eventId = `${personId}-${kind}`
      family.events.push({ ...family.events[0]!, id: eventId, kind, participants: [{ personId, role: 'subject' }] })
      family.claims.push({ id: `${eventId}-date`, field: 'date', target: { kind: 'event', id: eventId }, isPrimary: false,
        confidence: 'unassessed', provenance, value: { kind: 'point', raw: String(year), calendar: 'unspecified', qualifier: 'exact', value: { precision: 'year', year } } })
    }
    const before = structuredClone(family)
    expect(tooltipRelatives(family, 'I1').map(({ label }) => label)).toEqual(['Батько', 'Мати', 'Дружина', 'Донька', 'Син', 'Донька'])
    expect(tooltipRelatives(family, 'I1').map(({ relation }) => relation.id)).toEqual(['father', 'mother', 'spouse', 'child-second', 'child-first', 'child-undated'])
    expect(tooltipRelatives(family, 'I1').find(relative => relative.otherId === 'I5')?.years).toBe('1900 - 1980')
    expect(tooltipRelatives(family, 'I1').find(relative => relative.otherId === 'I6')?.years).toBe('нар. 1905')
    expect(tooltipRelatives(family, 'I1').find(relative => relative.otherId === 'I7')?.years).toBe('')
    expect(tooltipRelatives(family, 'I2')[0]!.label).toBe('Чоловік')
    expect(family).toEqual(before)
  })

  it('orders non-primary dates from birth to death and includes marriage and child births', () => {
    const family = familyDataSchema.parse(fixture)
    const provenance = family.people[0]!.provenance
    family.people.push({ ...family.people[0]!, id: 'I3', sex: 'M' })
    family.claims.push({ id: 'child-name', field: 'name', target: { kind: 'person', id: 'I3' },
      value: { raw: 'Дитина', display: 'Дитина' }, isPrimary: true, confidence: 'unassessed', provenance })
    family.relationships.push({ ...family.relationships[0]!, id: 'child', kind: 'parent-child', fromPersonId: 'I1', toPersonId: 'I3' })
    for (const [id, kind, personId, year] of [['death', 'death', 'I1', 1940], ['child-birth', 'birth', 'I3', 1900]] as const) {
      family.events.push({ ...family.events[0]!, id, kind, participants: [{ personId, role: 'subject' }] })
      family.claims.push({ id: `${id}-date`, field: 'date', target: { kind: 'event', id }, isPrimary: false,
        confidence: 'unassessed', provenance, value: { kind: 'point', calendar: 'unspecified', raw: String(year), qualifier: 'exact', value: { precision: 'year', year } } })
    }
    family.claims.push({ id: 'marriage-date', field: 'date', target: { kind: 'event', id: 'event-marriage' }, isPrimary: false,
      confidence: 'unassessed', provenance, value: { kind: 'point', calendar: 'unspecified', raw: '1899', qualifier: 'exact', value: { precision: 'year', year: 1899 } } })
    family.events.push({ ...family.events[0]!, id: 'status', kind: 'other', label: 'Caste Name ' })
    family.claims.push({ id: 'status-description', field: 'description', target: { kind: 'event', id: 'status' },
      value: 'козак', isPrimary: false, confidence: 'unassessed', provenance })
    family.claims.push({ id: 'status-description-duplicate', field: 'description', target: { kind: 'event', id: 'status' },
      value: 'Козак', isPrimary: false, confidence: 'unassessed', provenance })
    family.claims.forEach(claim => { claim.isPrimary = false })
    const before = structuredClone(family)
    const timeline = tooltipTimeline(family, 'I1')
    expect(timeline.map(entry => entry.id)).toEqual(['event-birth', 'event-marriage', 'child-birth', 'death'])
    expect(timeline.map(entry => [entry.label, entry.labelPersonIds])).toEqual([
      ['Народження', []], ['Шлюб', ['I2']], ['Народження сина', ['I3']], ['Смерть', []],
    ])
    expect(tooltipPersonTitle(family, 'I1')).toBe('Козак Тестова Особа')
    expect(tooltipPersonTitle(family, 'I2')).toBe('Приклад Вигаданий')
    expect(tooltipEventLabel({ ...family.events[0]!, kind: 'other', label: 'OCCU' })).toBe('Заняття')
    expect(tooltipEventLabel({ ...family.events[0]!, kind: 'other', label: 'Відомий опис події' })).toBe('Відомий опис події')
    expect(family).toEqual(before)
  })

  it('shows known spouse and child relationships without inventing source events or dates', () => {
    const family = familyDataSchema.parse(fixture)
    family.people.push({ ...family.people[0]!, id: 'I3', sex: 'F' })
    family.claims.push({ ...family.claims[0]!, id: 'child-name', field: 'name', target: { kind: 'person', id: 'I3' }, value: { raw: 'Оленка', display: 'Оленка' } })
    family.relationships.push({ ...family.relationships[0]!, id: 'child', kind: 'parent-child', fromPersonId: 'I1', toPersonId: 'I3' })
    family.events = []
    const before = structuredClone(family)
    const timeline = tooltipTimeline(family, 'I1')
    expect(timeline.map(entry => [entry.label, entry.labelPersonIds])).toEqual([['Шлюб', ['I2']], ['Донька', ['I3']]])
    expect(timeline.every(entry => entry.event === null && entry.dateKey === Infinity && entry.claims.length === 0)).toBe(true)
    expect(family).toEqual(before)
  })

  it('preserves separate marriage records and avoids adding a duplicate from the spouse relationship', () => {
    const family = familyDataSchema.parse(fixture)
    family.events.push({ ...family.events.find(event => event.kind === 'marriage')!, id: 'second-marriage-record' })
    const marriages = tooltipTimeline(family, 'I1').filter(entry => entry.stage === 2)
    expect(marriages.map(entry => entry.event?.id)).toEqual(['event-marriage', 'second-marriage-record'])
    expect(marriages.every(entry => entry.relationship?.id === 'rel-1')).toBe(true)
  })

  it('places undated marriages before their own children and preserves dated marriage chronology', () => {
    const family = familyDataSchema.parse(fixture)
    const provenance = family.people[0]!.provenance
    family.people.push(...(['I3', 'I4', 'I5', 'I6'] as const).map(id => ({ ...family.people[0]!, id })))
    for (const [id, fromPersonId, toPersonId, kind] of [
      ['second-spouse', 'I1', 'I3', 'spouse'],
      ['first-child', 'I1', 'I4', 'parent-child'],
      ['first-child-mother', 'I2', 'I4', 'parent-child'],
      ['second-child', 'I1', 'I5', 'parent-child'],
      ['second-child-mother', 'I3', 'I5', 'parent-child'],
      ['undated-child', 'I1', 'I6', 'parent-child'],
      ['undated-child-mother', 'I3', 'I6', 'parent-child'],
    ] as const) family.relationships.push({ ...family.relationships[0]!, id, fromPersonId, toPersonId, kind })
    for (const [personId, year] of [['I4', 1900], ['I5', 1920]] as const) {
      const id = `${personId}-birth`
      family.events.push({ ...family.events[0]!, id, participants: [{ personId, role: 'subject' }] })
      family.claims.push({ id: `${id}-date`, field: 'date', target: { kind: 'event', id }, isPrimary: false,
        confidence: 'unassessed', provenance, value: { kind: 'point', calendar: 'unspecified', raw: String(year), qualifier: 'exact', value: { precision: 'year', year } } })
    }
    const before = structuredClone(family)
    const timeline = tooltipTimeline(family, 'I1')
    expect(timeline.map(entry => entry.id)).toEqual([
      'event-birth', 'event-marriage', 'I4-birth', 'marriage/second-spouse', 'I5-birth', 'child/undated-child',
    ])
    expect(timeline.filter(entry => entry.stage === 2).every(entry => entry.dateKey === Infinity)).toBe(true)
    expect(timeline.filter(entry => entry.stage === 2).every(entry => tooltipTimelineYear(entry) === '')).toBe(true)
    expect(family).toEqual(before)
    family.claims.push({ id: 'known-marriage-date', field: 'date', target: { kind: 'event', id: 'event-marriage' },
      isPrimary: false, confidence: 'unassessed', provenance, value: { kind: 'point', calendar: 'unspecified', raw: '1905',
        qualifier: 'exact', value: { precision: 'year', year: 1905 } } })
    const dated = tooltipTimeline(family, 'I1').map(entry => entry.id)
    expect(dated.indexOf('event-marriage')).toBeGreaterThan(dated.indexOf('I4-birth'))
  })

  it('labels the first interval year while keeping full dates and leaving undated events blank', () => {
    const family = familyDataSchema.parse(fixture)
    const birth = tooltipTimeline(family, 'I1').find(entry => entry.event?.kind === 'birth')!
    expect(tooltipTimelineYear(birth)).toBe('1874')
    const alternative = family.claims.find(claim => claim.id === 'claim-date-alt')!
    expect(tooltipTimelineYear({ ...birth, claims: [alternative] })).toBe('бл. 1876')
    expect(tooltipTimelineYear({ ...birth, claims: [] })).toBe('')
    const date = birth.claims.find(claim => claim.field === 'date')!
    const range: Claim = { ...date, field: 'date', value: {
      kind: 'range', raw: 'BET 1932 AND 1933', calendar: 'unspecified', from: { precision: 'year', year: 1932 }, to: { precision: 'year', year: 1933 },
    } }
    expect(tooltipTimelineYear({ ...birth, claims: [range] })).toBe('1932')
    expect(tooltipClaimText(family, range)).toBe('між 1932 і 1933')
    expect(tooltipTimelineYear({ ...birth, claims: [{ ...date, field: 'date', value: {
      kind: 'period', raw: 'FROM 1932 TO 1933', calendar: 'unspecified', from: { precision: 'year', year: 1932 }, to: { precision: 'year', year: 1933 },
    } }] })).toBe('1932')
    if (date.field !== 'date' || date.value.kind !== 'point') throw new Error('Expected a point date in the fixture')
    expect(tooltipTimelineYear({ ...birth, claims: [{ ...date, value: { ...date.value, calendar: 'julian' } }] })).toBe('')
  })
})
