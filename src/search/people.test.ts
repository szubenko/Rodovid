import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json'
import minimal from '../../tests/fixtures/data-contract/minimal.json'
import { familyDataSchema } from '../data/schema'
import { buildPeopleIndex, normalizeSearch, searchPeople } from './people'

const ids = (query: string, family = familyDataSchema.parse(fixture)) =>
  searchPeople(buildPeopleIndex(family), query).map((entry) => entry.personId)

describe('local people search', () => {
  it('matches parts, reordered words, case and whitespace while preserving display spelling', () => {
    expect(ids('  ОСОБА\tТЕСТО  ')).toEqual(['I1'])
    expect(searchPeople(buildPeopleIndex(familyDataSchema.parse(fixture)), 'тестова')[0]?.name).toBe('Тестова Особа')
    expect(normalizeSearch('  ЙОСИП\u00a0\u00a0ДЕИ\u0306КАЛ  ')).toBe('йосип дейкал')
  })

  it('indexes prepared aliases and patronymics into the same person without duplicate results', () => {
    const family = familyDataSchema.parse(fixture)
    family.claims.push({ id: 'alias', target: { kind: 'person', id: 'I1' }, field: 'name',
      isPrimary: false, confidence: 'unassessed', provenance: family.people[0]!.provenance,
      value: { raw: 'Test /Alias/', display: 'Test Alias', given: 'Test', surname: 'Alias', patronymic: 'Петрівна' } })
    expect(ids('alias петрів', family)).toEqual(['I1'])
    expect(ids('тестова', family)).toEqual(['I1'])
    expect(ids('test тестова', family)).toEqual([])
    expect(searchPeople(buildPeopleIndex(family), 'test')[0]).toMatchObject({
      name: 'Тестова Особа', alternatives: ['Test Alias'],
    })
    expect(ids('т', family)).toEqual(['I1'])
  })

  it('keeps namesakes separate and uses existing uncertain years without invented facts', () => {
    const family = familyDataSchema.parse(fixture)
    const names = family.claims.filter((claim) => claim.field === 'name')
    names[1]!.value = { ...names[0]!.value }
    const results = searchPeople(buildPeopleIndex(family), 'тестова')
    expect(results.map((entry) => [entry.personId, entry.years])).toEqual([
      ['I1', 'нар. 1874 (є інші дати)'], ['I2', 'Роки життя невідомі'],
    ])
  })

  it('has empty and no-match states and does not index a fabricated unknown name', () => {
    expect(ids(' \n\t')).toEqual([])
    expect(ids('Неіснуюче')).toEqual([])
    expect(ids('невідоме', familyDataSchema.parse(minimal))).toEqual([])
  })

  it('never autocorrects, transliterates or changes source claims', () => {
    const family = familyDataSchema.parse(fixture)
    const name = family.claims.find((claim) => claim.field === 'name')!
    name.value = { raw: 'Сегрій /Зубенко/', display: 'Сегрій Зубенко' }
    const before = JSON.stringify(family)
    expect(ids('Сегрій', family)).toEqual(['I1'])
    expect(ids('Сергій', family)).toEqual([])
    expect(ids('Sehrii', family)).toEqual([])
    expect(JSON.stringify(family)).toBe(before)
  })
})
