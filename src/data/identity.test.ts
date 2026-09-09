import { describe, expect, it } from 'vitest'
import manifest from '../../tests/fixtures/data-contract/reexport-identities.json'
import full from '../../tests/fixtures/data-contract/full.json'
import { identityManifestSchema, resolveCanonicalId } from './identity'
import { initialPersonId, personIdFromRoute, personIdToRoute } from './ids'

describe('stable identities and route segments', () => {
  it('maps the initial @I1@ to I1 and round-trips the route segment', () => {
    expect(initialPersonId('@I1@')).toBe('I1')
    expect(personIdFromRoute(personIdToRoute('I1'))).toBe('I1')
  })

  it.each(['@I1@', '%40I1%40', 'I1/room', ' I1', 'I1?x', 'I1#x', '../I1', 'i1', 'I'])('rejects ambiguous route segment %s', (id) => {
    expect(() => personIdFromRoute(id)).toThrow()
  })

  it('keeps canonical IDs after changing both GEDCOM IDs and nested record order', () => {
    const personId = resolveCanonicalId(manifest, 'person', { importId: 'fixture-new', recordId: '@I42@' })
    expect(personId).toBe('I1')
    expect(full.config.homePersonId).toBe(personId)
    expect(full.config.rooms[0]?.personId).toBe(personId)
    expect(full.evidenceLinks.find((link) => link.id === 'link-person-1')?.target.id).toBe(personId)
    expect(resolveCanonicalId(manifest, 'claim', {
      importId: 'fixture-new', recordId: '@I42@', path: 'BIRT[1].DATE[0]',
    })).toBe('claim-date-main')
    expect(resolveCanonicalId(manifest, 'person', { importId: 'fixture-old', recordId: '@I1@' })).toBe('I1')
  })

  it('fails on missing mapping even if a new export reuses an old GEDCOM ID', () => {
    expect(() => resolveCanonicalId(manifest, 'person', { importId: 'fixture-new', recordId: '@I1@' }))
      .toThrow('Missing explicit identity mapping')
    expect(() => resolveCanonicalId(manifest, 'person', { importId: 'unknown', recordId: '@I1@' })).toThrow()
  })

  it('rejects two canonical people assigned to the same export record', () => {
    const conflicting = structuredClone(manifest)
    conflicting.entries.push({ entity: { kind: 'person', id: 'I2' }, origins: [{ importId: 'fixture-new', recordId: '@I42@' }] })
    expect(identityManifestSchema.safeParse(conflicting).success).toBe(false)
    expect(() => resolveCanonicalId(conflicting, 'person', { importId: 'fixture-new', recordId: '@I42@' })).toThrow()
  })

  it('rejects duplicate identities, undeclared imports and implicit merging', () => {
    expect(identityManifestSchema.safeParse({ ...manifest, entries: [...manifest.entries, manifest.entries[0]] }).success).toBe(false)
    expect(identityManifestSchema.safeParse({ ...manifest, imports: manifest.imports.slice(0, 1) }).success).toBe(false)
    const merged = identityManifestSchema.parse(structuredClone(manifest))
    merged.entries[0]?.origins.push({ importId: 'fixture-new', recordId: '@I43@' })
    expect(identityManifestSchema.safeParse(merged).success).toBe(false)
    expect(identityManifestSchema.safeParse({ ...manifest, imports: [...manifest.imports, manifest.imports[0]] }).success).toBe(false)
  })
})
