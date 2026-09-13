import { expect, it } from 'vitest'
import { familyDataSchema } from '../data/schema'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { personEvidence } from './archive-data'

it('scopes shared sources through explicit people, events, claims and relationships', () => {
  const family = familyDataSchema.parse(fixture)
  expect(personEvidence(family, 'I1').map(e => e.id)).toEqual(['link-person-1', 'link-event', 'link-relation', 'link-main', 'link-alt'])
  expect(personEvidence(family, 'I2').map(e => e.id)).toEqual(['link-person-2', 'link-event', 'link-relation'])
  expect(personEvidence(family, 'I999')).toEqual([])
})
