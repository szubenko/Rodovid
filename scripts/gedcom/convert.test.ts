import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { convertGedcom } from './convert.ts'
import type { ConversionInput } from './convert.ts'
import { supplementsSchema } from '../../src/data/supplements.ts'
import type { FamilyData, Claim } from '../../src/data/schema.ts'

const root = new URL('../../', import.meta.url)
const baseline = readFileSync(new URL('Data/Zubenko.ged', root))
const bytes = readFileSync(new URL('tests/fixtures/conversion/complex.ged', root))
const config = { schemaVersion: 1, dataVersion: 'test', title: 'Тест', homePersonId: 'I1' }
const empty = { schemaVersion: 1 }
const convert = (overrides: Partial<ConversionInput> = {}) => convertGedcom({ bytes, config, supplements: empty, datasetKind: 'synthetic', ...overrides })
const origin = (entryId: string) => [{ kind: 'supplement' as const, file: 'test.json', entryId }]

function additions(data: FamilyData) {
  const names = data.claims.filter((claim) => claim.field === 'name' && claim.target.id === 'I1')
  const date = data.claims.find((claim) => claim.field === 'date')!
  const relation = data.relationships[0]!
  const supplements = supplementsSchema.parse({
    schemaVersion: 1,
    primaryClaimIds: [names[1]!.id],
    assessments: [{ id: 'assessment-test', target: { kind: 'claim', id: date.id }, confidence: 'probable', explanation: 'Із примітки' },
      { id: 'assessment-relation', target: { kind: 'relationship', id: relation.id }, confidence: 'hypothesis', reviewStatus: 'disputed', explanation: 'Суперечність' }],
    additionalClaims: [{ reason: 'Окреме сімейне свідчення', claim: {
      id: 'claim-extra', field: 'name', target: { kind: 'person', id: 'I1' },
      value: { raw: 'Інший варіант', display: 'Інший варіант' }, provenance: origin('claim-extra'),
    } }],
    placeEnrichments: [{ id: 'place-review', placeId: data.places[0]!.id, displayName: 'Уточнена назва',
      coordinates: { latitude: 50, longitude: 30 }, explanation: 'Явне тестове зіставлення' }],
    media: [{ id: 'document', path: 'assets/documents/test.pdf', mimeType: 'application/pdf', title: 'Тестовий файл', provenance: origin('document') }],
    sources: [{ id: 'source-extra', title: 'Один документ', mediaIds: ['document'], provenance: origin('source-extra') }],
    evidenceLinks: [date, names[0]!].map((claim, i) => ({
      id: `evidence-${i}`, sourceId: 'source-extra', target: { kind: 'claim', id: claim.id },
      fragment: { mediaId: 'document', page: i + 1 }, transcription: `Фрагмент ${i}`, provenance: origin(`evidence-${i}`),
    })),
    memories: [{ id: 'memory-test', personIds: ['I1', 'I2'], title: 'Спогад', markdown: 'Умовний **спогад**.', mediaIds: ['document'], provenance: origin('memory-test') }],
  })
  return supplements
}

describe('family JSON conversion', () => {
  it('uses the committed identity journal and all six review decisions without inventing evidence', () => {
    const identities = JSON.parse(readFileSync(new URL('Data/identities.json', root), 'utf8'))
    const supplements = JSON.parse(readFileSync(new URL('Data/annotations.json', root), 'utf8'))
    const result = convert({ bytes: baseline, config: JSON.parse(readFileSync(new URL('Data/site.json', root), 'utf8')), identities, supplements, datasetKind: 'family' })
    for (const code of ['D01', 'D02', 'D03', 'D04', 'D05', 'D06']) {
      expect(result.report.reviewNotes.some((note) => note.explanation?.includes(code))).toBe(true)
    }
    expect(result.family.relationships.filter((relation) => relation.fromPersonId === 'I9' && relation.toPersonId === 'I6'))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'parent-child', reviewStatus: 'unreviewed', confidence: 'unassessed', explanation: expect.stringContaining('D03') }),
        expect.objectContaining({ kind: 'spouse', reviewStatus: 'unreviewed', confidence: 'unassessed', explanation: expect.stringContaining('D03') }),
      ]))
    expect(result.family.places.every((place) => place.coordinates === undefined && place.displayName === undefined)).toBe(true)
    expect(result.family.sources).toEqual([])
    expect(convert({ bytes: baseline, config: result.family.config, identities, supplements, datasetKind: 'family' })).toEqual(result)
  })

  it('preserves the complete baseline, independent family records and missing content', () => {
    const before = Buffer.from(baseline)
    const result = convert({ bytes: baseline, config: JSON.parse(readFileSync(new URL('Data/site.json', root), 'utf8')), datasetKind: 'family' })
    expect(result.report.counts).toMatchObject({ people: 25, families: 9, childLinks: 32, events: 48, sources: 0, media: 0, evidenceLinks: 0, memories: 0 })
    expect(result.family.people.map((person) => person.id)).toEqual(Array.from({ length: 25 }, (_, i) => `I${i + 1}`))
    expect(result.family.config.homePersonId).toBe('I1')
    expect(result.family.claims.find((claim) => claim.field === 'name' && claim.target.id === 'I1')).toMatchObject({ value: { display: 'Сегрій Зубенко' } })
    expect(result.family.relationships.some((relation) => relation.fromPersonId === 'I9' && relation.toPersonId === 'I6' && relation.kind === 'parent-child')).toBe(true)
    expect(result.family.events.filter((event) => event.kind === 'marriage')).toHaveLength(4)
    expect(result.family.relationships.every((relation) => relation.reviewStatus === 'unreviewed' && relation.confidence === 'unassessed')).toBe(true)
    expect(result.family.places.every((place) => place.coordinates === undefined)).toBe(true)
    expect(result.family.people.every((person) => person.photoIds.length === 0 && person.lifeStatus !== 'alive')).toBe(true)
    expect(result.report.warnings.filter((warning) => warning.code === 'POSSIBLE_DUPLICATE_FAMILY')).toHaveLength(4)
    expect(baseline).toEqual(before)
    expect(convert({ bytes: baseline, config: result.family.config, datasetKind: 'family', identities: result.identities })).toEqual(result)
  })

  it('keeps names, repeated events, sources, raw notes, QUAY and event types independently', () => {
    const { family, report } = convert()
    expect(family.people).toHaveLength(3) // identical names do not merge I1 and I2
    expect(family.claims.filter((claim) => claim.field === 'name' && claim.target.id === 'I1')).toHaveLength(2)
    expect(family.claims.every((claim) => !claim.isPrimary && claim.confidence === 'unassessed')).toBe(true)
    expect(family.events.filter((event) => event.kind === 'birth')).toHaveLength(2)
    expect(family.events.map((event) => event.kind)).toEqual(['birth', 'birth', 'baptism', 'residence', 'other', 'death', 'marriage'])
    expect(family.sources).toHaveLength(1)
    expect(family.sources[0]!.title).toBe('Синтетична книга')
    expect(family.evidenceLinks).toHaveLength(2)
    expect(family.evidenceLinks[0]).toMatchObject({ quay: { raw: '2', value: 2 }, transcription: 'Рядок запису\nДругий рядокпродовження' })
    expect(family.claims.find((claim) => claim.field === 'description' && claim.target.id === 'I1')).toMatchObject({ value: 'Спільна нотатка\nДругий абзац' })
    expect(family.people[0]!.lifeStatus).toBe('deceased')
    expect(family.people[1]!.lifeStatus).toBe('unknown')
    expect(report.warnings.some((warning) => warning.code === 'UNPARSED_DATE')).toBe(true)
    expect(report.unhandledNodes).toEqual([])
  })

  it('merges explicit alternatives, assessments, place details and shared document fragments', () => {
    const first = convert()
    const supplements = additions(first.family)
    const before = structuredClone(supplements)
    const { family } = convert({ supplements, identities: first.identities })
    expect(supplements).toEqual(before)
    expect(family.claims.filter((claim) => claim.field === 'name' && claim.target.id === 'I1')).toHaveLength(3)
    expect(family.claims.filter((claim) => claim.isPrimary).map((claim) => claim.id)).toEqual(supplements.primaryClaimIds)
    expect(family.claims.find((claim) => claim.id === 'claim-extra')!.explanation).toContain('Окреме сімейне свідчення')
    expect(family.claims.find((claim) => claim.id === supplements.assessments[0]!.target.id)).toMatchObject({ confidence: 'probable', explanation: 'Із примітки' })
    expect(family.relationships[0]).toMatchObject({ confidence: 'hypothesis', reviewStatus: 'disputed' })
    expect(family.places[0]).toMatchObject({ originalName: 'Стара назва', displayName: 'Уточнена назва', coordinates: { latitude: 50, longitude: 30 } })
    expect(family.media).toHaveLength(1)
    expect(family.evidenceLinks.filter((link) => link.sourceId === 'source-extra').map((link) => link.fragment?.page)).toEqual([1, 2])
    expect(family.memories[0]).toMatchObject({ personIds: ['I1', 'I2'], markdown: 'Умовний **спогад**.' })
  })

  it('preserves canonical IDs, settings and materials only with explicit mappings for a re-export', () => {
    const first = convert()
    const supplements = additions(first.family)
    const customizedConfig = { ...config, rooms: [{ personId: 'I1', theme: 'archive' }] }
    const before = convert({ identities: first.identities, supplements, config: customizedConfig })
    const renamed = new Map([['@I1@', '@I42@'], ['@I2@', '@I99@'], ['@I3@', '@I98@'], ['@F1@', '@F42@'], ['@S1@', '@S42@'], ['@N1@', '@N42@']])
    const nextBytes = Buffer.from(bytes.toString('utf8').replace(/@[A-Z]\d+@/g, (xref) => renamed.get(xref) ?? xref))
    const identities = structuredClone(first.identities)
    identities.imports.push({ id: 'reexport', sha256: createHash('sha256').update(nextBytes).digest('hex') })
    expect(() => convert({ bytes: nextBytes, identities, supplements })).toThrow('Missing explicit identity mapping')
    for (const entry of identities.entries) entry.origins.push({ ...entry.origins[0]!, importId: 'reexport', recordId: renamed.get(entry.origins[0]!.recordId)! })
    const after = convert({ bytes: nextBytes, identities, supplements, config: customizedConfig })
    const withoutOrigins = (family: FamilyData) => JSON.parse(JSON.stringify(family, (key, value) => key === 'provenance' ? undefined : value))
    expect(withoutOrigins(after.family)).toEqual(withoutOrigins(before.family))
    expect(after.family.people[0]!.provenance[0]).toMatchObject({ recordId: '@I42@', importId: 'reexport' })
    expect(after.identities.entries[0]!.origins).toHaveLength(2)
    identities.entries.find((entry) => entry.entity.kind === 'claim')!.origins.pop()
    expect(() => convert({ bytes: nextBytes, identities, supplements })).toThrow('Missing explicit identity mapping: claim')
  })

  it('does not reuse XREFs after even a text-only change without a registered checksum', () => {
    const first = convert()
    expect(() => convert({ bytes: Buffer.from(bytes.toString('utf8').replace('Тест', 'Інше')), identities: first.identities })).toThrow('SHA-256')
  })

  it('keeps source notes when a separate assessment adds its own explanation', () => {
    const modified = Buffer.from(bytes.toString('utf8').replace('2 GIVN Тест', '2 NOTE Вихідна примітка\n2 GIVN Тест'))
    const first = convert({ bytes: modified })
    const name = first.family.claims.find((claim) => claim.field === 'name')!
    const result = convert({ bytes: modified, identities: first.identities, supplements: {
      schemaVersion: 1, assessments: [{ id: 'review', target: { kind: 'claim', id: name.id }, explanation: 'Окреме пояснення' }],
    } })
    expect(result.family.claims.find((claim) => claim.id === name.id)!.explanation).toBe('Вихідна примітка\nОкреме пояснення')
  })

  it('keeps nested fact identities when an explicit re-export mapping swaps event order', () => {
    const first = convert()
    const original = bytes.toString('utf8')
    const start = original.indexOf('1 BIRT\n')
    const middle = original.indexOf('1 BIRT\n', start + 1)
    const end = original.indexOf('1 BAPM\n', middle)
    const changed = Buffer.from(original.slice(0, start) + original.slice(middle, end) + original.slice(start, middle) + original.slice(end))
    const identities = structuredClone(first.identities)
    identities.imports.push({ id: 'reordered', sha256: createHash('sha256').update(changed).digest('hex') })
    for (const entry of identities.entries) {
      const previous = entry.origins[0]!
      const path = previous.recordId === '@I1@' ? previous.path?.replace(/^BIRT\[([01])\]/, (_, index) => `BIRT[${index === '0' ? '1' : '0'}]`) : previous.path
      entry.origins.push({ ...previous, importId: 'reordered', path })
    }
    const result = convert({ bytes: changed, identities, supplements: additions(first.family) })
    for (const date of first.family.claims.filter((claim) => claim.field === 'date')) {
      expect(result.family.claims.find((claim) => claim.id === date.id)?.value).toEqual(date.value)
    }
    expect(result.family.evidenceLinks.filter((link) => link.sourceId === 'source-extra')).toHaveLength(2)
  })

  it.each(['assessment', 'primary', 'place', 'memory', 'source', 'fragment', 'room', 'claim'])(
    'fails for an orphan %s instead of dropping the addition', (kind) => {
      const first = convert()
      const supplements = additions(first.family)
      let settings: unknown = config
      if (kind === 'assessment') supplements.assessments[0]!.target.id = 'missing'
      if (kind === 'primary') supplements.primaryClaimIds = ['missing']
      if (kind === 'place') supplements.placeEnrichments[0]!.placeId = 'missing'
      if (kind === 'memory') supplements.memories[0]!.personIds = ['I-missing']
      if (kind === 'source') supplements.evidenceLinks[0]!.sourceId = 'missing'
      if (kind === 'fragment') supplements.sources[0]!.mediaIds = []
      if (kind === 'room') settings = { ...config, rooms: [{ personId: 'I-missing' }] }
      if (kind === 'claim') supplements.additionalClaims[0]!.claim.target.id = 'I-missing'
      expect(() => convert({ identities: first.identities, supplements, config: settings })).toThrow(/Unresolved|does not belong/)
    },
  )

  it('rejects conflicting additions and duplicate entity IDs', () => {
    const first = convert()
    const supplements = additions(first.family)
    const duplicated = structuredClone(supplements)
    duplicated.assessments.push({ ...duplicated.assessments[0]!, id: 'another-assessment' })
    expect(() => convert({ supplements: duplicated })).toThrow('Conflicting assessments')
    const names = first.family.claims.filter((claim) => claim.field === 'name' && claim.target.id === 'I1')
    expect(() => convert({ supplements: { ...supplements, primaryClaimIds: names.map((claim) => claim.id) } })).toThrow('Conflicting primary selections')
    expect(() => convert({ supplements: { ...supplements, media: [...supplements.media, ...supplements.media] } })).toThrow('Duplicate media ID')
  })

  it('retains unsupported structures and media paths in the report', () => {
    const changed = bytes.toString('utf8').replace('1 NAME Тест', '1 _UNKNOWN extension\n1 OBJE\n2 FILE C:\\archive\\scan.jpg\n1 NAME Тест')
    const result = convert({ bytes: Buffer.from(changed) })
    expect(result.report.unhandledNodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ tag: '_UNKNOWN', value: 'extension', recordId: '@I1@' }),
      expect.objectContaining({ tag: 'FILE', value: 'C:\\archive\\scan.jpg', path: 'OBJE[0].FILE[0]' }),
    ]))
    expect(result.family.media).toEqual([])
  })

  it('does not invent children from marriage, and rejects broken family links', () => {
    const withoutChild = bytes.toString('utf8').replace('1 CHIL @I3@\n', '').replace('1 FAMC @F1@\n', '')
    expect(convert({ bytes: Buffer.from(withoutChild) }).family.relationships.map((relation) => relation.kind)).toEqual(['spouse'])
    expect(() => convert({ bytes: Buffer.from(bytes.toString('utf8').replace('1 CHIL @I3@', '1 CHIL @I404@')) })).toThrow(/reference|Inconsistent/)
  })

  it('rejects cyclic shared notes and unused mappings', () => {
    expect(() => convert({ bytes: Buffer.from(bytes.toString('utf8').replace('0 @N1@ NOTE Спільна нотатка', '0 @N1@ NOTE @N1@')) })).toThrow('Cyclic NOTE')
    const first = convert()
    first.identities.entries.push({ entity: { kind: 'claim', id: 'missing' }, origins: [{ importId: first.identities.imports[0]!.id, recordId: '@I1@', path: 'NAME[100]' }] })
    expect(() => convert({ identities: first.identities })).toThrow('Unused identity mapping')
  })

  it('replaces an old primary flag without removing its alternative', () => {
    const first = convert()
    const alternative: Claim = { ...first.family.claims.find((claim) => claim.field === 'name')!, id: 'other-name', isPrimary: true }
    const result = convert({ supplements: { schemaVersion: 1, additionalClaims: [{ reason: 'Тест', claim: alternative }], primaryClaimIds: [first.family.claims[0]!.id] } })
    expect(result.family.claims.find((claim) => claim.id === 'other-name')!.isPrimary).toBe(false)
    expect(result.family.claims[0]!.isPrimary).toBe(true)
  })
})
