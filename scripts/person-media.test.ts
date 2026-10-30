import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'

const bytes = readFileSync(new URL('../tests/fixtures/conversion/complex.ged', import.meta.url))
const origin = [{ kind: 'supplement', file: 'test.json', entryId: 'photo' }]
const photo = { id: 'photo', path: 'assets/photos/test.png', mimeType: 'image/png', title: 'Портрет', provenance: origin }
const entry = { id: 'person-photo', personId: 'I2', photoIds: ['photo'], portraitId: 'photo' }
const convert = (personMedia: unknown, media: unknown[] = [photo]) => convertGedcom({
  bytes, config: { schemaVersion: 1, dataVersion: 'test', title: 'Тест', homePersonId: 'I1' },
  supplements: { schemaVersion: 1, media, personMedia }, datasetKind: 'synthetic',
})

it('binds photos and the portrait to the explicit stable person without changing other people or the input', () => {
  const input = structuredClone(entry)
  const { family } = convert([input])
  expect(input).toEqual(entry)
  expect(family.people.find(person => person.id === 'I2')).toMatchObject({ photoIds: ['photo'], portraitId: 'photo',
    provenance: expect.arrayContaining([{ kind: 'supplement', file: 'Data/annotations.json', entryId: entry.id }]) })
  expect(family.people.filter(person => person.id !== 'I2').every(person => !person.portraitId && !person.photoIds.length)).toBe(true)
})

it('keeps a diagram portrait independent from the gallery, including a portrait without gallery photos', () => {
  const galleryPhoto = { ...photo, id: 'gallery-photo', path: 'assets/photos/gallery.png' }
  const { family } = convert([{ ...entry, photoIds: ['gallery-photo'] }], [photo, galleryPhoto])
  expect(family.people.find(person => person.id === 'I2')).toMatchObject({ photoIds: ['gallery-photo'], portraitId: 'photo' })
  expect(convert([{ ...entry, photoIds: [] }]).family.people.find(person => person.id === 'I2'))
    .toMatchObject({ photoIds: [], portraitId: 'photo' })
})

it('rejects unknown people, missing media, duplicate bindings, and empty assignments', () => {
  expect(() => convert([{ ...entry, personId: 'I999' }])).toThrow('Unresolved person media')
  expect(() => convert([entry], [])).toThrow('Unresolved media reference')
  expect(() => convert([entry, { ...entry, id: 'another-entry' }])).toThrow('Conflicting person media')
  expect(() => convert([{ ...entry, portraitId: 'another-photo' }])).toThrow('Unresolved media reference')
  expect(() => convert([{ ...entry, photoIds: [], portraitId: undefined }])).toThrow('Provide photos or a portrait')
})
