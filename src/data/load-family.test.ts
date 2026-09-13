import { describe, expect, it, vi } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/minimal.json'
import { createFamilyLoader, personName } from './load-family'
import { familyDataSchema } from './schema'

const valid = () => familyDataSchema.parse({ ...structuredClone(fixture), datasetKind: 'family' })

describe('family loader', () => {
  it('shares pending and completed requests without browser persistence', async () => {
    const fetchData = vi.fn<typeof fetch>().mockResolvedValue(Response.json(valid()))
    const load = createFamilyLoader(fetchData)
    const first = load()
    expect(load()).toBe(first)
    const family = await first
    expect(await load()).toBe(family)
    expect(fetchData).toHaveBeenCalledExactlyOnceWith('/data/family.json', { cache: 'no-store' })
  })

  it.each(['http', 'network', 'json', 'schema', 'home', 'duplicate', 'relationship', 'synthetic'])('rejects %s errors and allows an explicit retry', async (failure) => {
    const data = valid()
    if (failure === 'home') data.config.homePersonId = 'I999'
    if (failure === 'duplicate') data.people.push(structuredClone(data.people[0]!))
    const broken: unknown = failure === 'schema' ? { schemaVersion: 999 }
      : failure === 'synthetic' ? fixture
      : failure === 'relationship' ? { ...data, relationships: [{ id: 'R1', kind: 'spouse', fromPersonId: 'I1', toPersonId: 'I999', provenance: data.people[0]!.provenance }] }
      : data
    const fetchData = vi.fn<typeof fetch>()
    if (failure === 'network') fetchData.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    else fetchData.mockResolvedValueOnce(failure === 'http' ? new Response('', { status: 503 })
      : failure === 'json' ? new Response('<html>') : Response.json(broken))
    fetchData.mockResolvedValueOnce(Response.json(valid()))
    const load = createFamilyLoader(fetchData)
    await expect(load()).rejects.toThrow()
    await expect(load()).resolves.toHaveProperty('config.homePersonId', 'I1')
    expect(fetchData).toHaveBeenCalledTimes(2)
  })

  it('uses a text fallback when there is no name claim', () => {
    const family = familyDataSchema.parse(valid())
    expect(personName({ ...family, claims: [] }, 'I1')).toBe('Ім’я невідоме')
  })
})
