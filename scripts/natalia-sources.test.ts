import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveSourceRecordFiles } from './source-record-files'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert'
import { biographyTimeline } from '../src/graph/person-tooltip-data'
import { personFullName, personName } from '../src/data/person-name'
import { buildPeopleIndex } from '../src/search/people'

it('assigns Natalia’s four sources to her birth, marriage and two child births, preserving personal citations', () => {
  const read = (file: string) => readFileSync(new URL(`../Data/${file}`, import.meta.url))
  const json = (file: string) => JSON.parse(read(file).toString())
  const { family } = convertGedcom({ bytes: read('Zubenko.ged'), config: json('site.json'),
    supplements: resolveSourceRecordFiles(json('annotations.json'), fileURLToPath(new URL('../Data', import.meta.url))), identities: json('identities.json') })
  const personId = family.people.find(person => person.externalIds.some(id => id.value === 'PFFS-2YZ'))!.id
  expect(personFullName(family, personId)).toBe('Наталія Семенівна Заприса')
  expect(personName(family, personId)).toBe('Наталия Заприса')
  expect(buildPeopleIndex(family).find(person => person.personId === personId)?.name).toBe('Наталия Заприса')
  expect(family.claims.some(claim => claim.field === 'name' && claim.target.id === personId
    && claim.value.display === 'Наталія Семенівна Заприса')).toBe(false)
  expect(family.claims).toContainEqual(expect.objectContaining({
    field: 'name', target: { kind: 'person', id: personId }, isPrimary: true,
    value: expect.objectContaining({ display: 'Наталия Заприса' }),
  }))
  const timeline = biographyTimeline(family, personId)
  const expected = [
    ['@I39@', 'birth', '6X32-NT61'],
    ['@F15@', 'marriage', '6XST-5XK9'],
    ['@I41@', 'birth', '6X3L-JXHD'],
    ['@I50@', 'birth', '6X37-6N4T'],
  ]
  for (const [recordId, kind, ark] of expected) {
    const event = timeline.find(({ event }) => event && event.kind === kind && event.provenance.some(origin => origin.kind === 'gedcom' && origin.recordId === recordId))!.event!
    const links = family.evidenceLinks.filter(link => link.target.kind === 'event' && link.target.id === event.id)
    expect(links).toHaveLength(1)
    expect(family.sources.find(source => source.id === links[0]!.sourceId)!.description).toContain(ark)
    expect(links[0]!.explanation).toContain(ark)
  }
  const death = timeline.find(entry => entry.event?.kind === 'death')!.event!
  expect(family.evidenceLinks.filter(link => link.target.kind === 'event' && link.target.id === death.id)).toHaveLength(0)
  expect(family.evidenceLinks.filter(link => link.target.kind === 'person' && link.target.id === personId)).toHaveLength(4)
})
