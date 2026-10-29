import { mkdtempSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { convertGedcom } from '../gedcom/convert.ts'
import { convertDate } from '../gedcom/dates.ts'
import { familyDataSchema, relationshipSchema, claimSchema, eventSchema, mediaSchema } from '../../src/data/schema.ts'
import { validateData } from './validate.ts'
import { renderReport } from './report.ts'

const root = new URL('../../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root))
const json = (path: string) => JSON.parse(read(path).toString('utf8'))
const minimal = () => familyDataSchema.parse(json('tests/fixtures/data-contract/minimal.json'))
const provenance = [{ kind: 'gedcom' as const, importId: 'test-import', recordId: '@F1@' }]
const edge = (id: string, from: string, to: string, kind: 'parent-child' | 'spouse' = 'parent-child') =>
  relationshipSchema.parse({ id, kind, fromPersonId: from, toPersonId: to, provenance })
const options = { assetsRoot: resolve('tmp/no-optional-assets-needed') }
const baseline = () => convertGedcom({ bytes: read('tests/fixtures/baseline-2026-09-02/Zubenko.ged'), config: json('tests/fixtures/baseline-2026-09-02/site.json'),
  supplements: json('tests/fixtures/baseline-2026-09-02/annotations.json'), identities: json('tests/fixtures/baseline-2026-09-02/identities.json') })
const synthetic = (extra = '') => convertGedcom({ bytes: Buffer.from(read('tests/fixtures/conversion/complex.ged')
  .toString('utf8').replace('1 NAME Тест /Однакове/', `${extra ? `${extra}\n` : ''}1 NAME Тест /Однакове/`)),
  config: minimal().config, supplements: { schemaVersion: 1 }, datasetKind: 'synthetic' })

describe('preparation validation', () => {
  it('accepts absent optional content without requiring an assets directory', async () => {
    const report = await validateData(minimal(), options)
    expect(report.status).toBe('passed')
    expect(report.totals.errors).toBe(0)
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'OPTIONAL_CONTENT' }))
  })

  it('checks the actual baseline, all D01–D06, and produces a deterministic readable report', async () => {
    const { family, report: conversion } = baseline()
    const before = structuredClone(family)
    const report = await validateData(family, { ...options, conversion })
    expect(report.status).toBe('passed')
    expect(report.counts).toMatchObject({ people: 25, families: 9, childLinks: 32, events: 48, relationships: 71, places: 24 })
    expect(report.totals.warnings).toBe(9)
    expect(report.issues.filter((issue) => /^D0[1-6]$/.test(issue.code)).map((issue) => issue.code)).toEqual(['D01', 'D02', 'D03', 'D04', 'D05', 'D06'])
    expect(report.issues.find((issue) => issue.code === 'CONFLICTING_ROLES')?.recordIds).toEqual(['@F3@', '@F5@'])
    expect(report.issues.filter((issue) => issue.code === 'POSSIBLE_DUPLICATE_FAMILY').map((issue) => issue.recordIds))
      .toEqual([['@F6@', '@F7@'], ['@F8@', '@F9@']])
    expect(report.issues.filter((issue) => issue.code === 'UNMAPPED_SEX')).toEqual([])
    expect(conversion.unhandledNodes.filter(node => node.tag === 'SEX')).toEqual([])
    expect(renderReport(report)).toContain('Не встановлюється автоматично')
    expect(await validateData(family, { ...options, conversion })).toEqual(report)
    expect(family).toEqual(before)
  })

  it.each(['M', 'F', 'U'] as const)('preserves supported SEX %s without reporting it as lost data', async sex => {
    const { family, report: conversion } = synthetic(`1 SEX ${sex}`)
    expect(family.people.find(person => person.id === 'I1')?.sex).toBe(sex)
    expect(conversion.unhandledNodes.filter(node => node.tag === 'SEX')).toEqual([])
    expect((await validateData(family, { ...options, conversion })).status).toBe('passed')
  })

  it('allows absent SEX without inventing a value or reporting lost data', async () => {
    const { family, report: conversion } = synthetic()
    expect(family.people.find(person => person.id === 'I1')?.sex).toBeUndefined()
    expect((await validateData(family, { ...options, conversion })).status).toBe('passed')
  })

  it.each(['1 SEX X', '1 SEX', '1 SEX M\n1 SEX F', '1 SEX M\n2 _DETAIL important'])(
    'rejects unsupported or ambiguous SEX information: %s', async extra => {
      const { family, report: conversion } = synthetic(extra)
      const report = await validateData(family, { ...options, conversion })
      expect(report.status).toBe('failed')
      expect(report.issues).toContainEqual(expect.objectContaining({
        severity: 'error', code: 'UNSUPPORTED_STRUCTURE', recordIds: ['@I1@'], path: expect.stringMatching(/^SEX\[/u),
      }))
    },
  )

  it.each(['explanation', 'confidence', 'reviewStatus'] as const)('blocks bypass of reviewed uncertainty through %s', async (field) => {
    const { family, report: conversion } = baseline()
    const relationship = family.relationships.find((item) => item.explanation?.includes('D03'))!
    if (field === 'explanation') delete relationship.explanation
    else if (field === 'confidence') relationship.confidence = 'confirmed'
    else relationship.reviewStatus = 'accepted'
    expect((await validateData(family, { ...options, conversion })).issues).toContainEqual(expect.objectContaining({ code: 'REVIEW_POLICY_MISSING', severity: 'error' }))
  })

  it('rejects removal of imported baseline data even when the remaining JSON is valid', async () => {
    const { family, report: conversion } = baseline()
    family.events.pop()
    expect((await validateData(family, { ...options, conversion })).issues).toContainEqual(expect.objectContaining({ code: 'BASELINE_DATA_LOSS' }))
  })

  it.each([
    ['schema', (data: ReturnType<typeof minimal>) => { Object.assign(data, { unexpected: true }) }],
    ['home', (data: ReturnType<typeof minimal>) => { data.config.homePersonId = 'I999' }],
    ['duplicate ID', (data: ReturnType<typeof minimal>) => { data.people.push(structuredClone(data.people[0]!)) }],
    ['media reference', (data: ReturnType<typeof minimal>) => { data.people[0]!.portraitId = 'missing-media' }],
    ['room', (data: ReturnType<typeof minimal>) => { data.config.rooms.push({ personId: 'I404' }) }],
    ['audio', (data: ReturnType<typeof minimal>) => { data.config.audio.effectMediaIds.push('missing-sound') }],
    ['relationship', (data: ReturnType<typeof minimal>) => { data.relationships.push(edge('rel-1', 'I1', 'I99')) }],
  ])('rejects invalid %s', async (_, mutate) => {
    const data = minimal()
    mutate(data)
    expect((await validateData(data, options)).status).toBe('failed')
  })

  it('terminates a cycle and lists every involved relationship and source record', async () => {
    const data = minimal()
    data.people.push({ ...data.people[0]!, id: 'I2' }, { ...data.people[0]!, id: 'I3' })
    data.relationships = [edge('rel-a', 'I1', 'I2'), edge('rel-b', 'I2', 'I3'), edge('rel-c', 'I3', 'I1')]
    const report = await validateData(data, options)
    expect(report.issues.find((issue) => issue.code === 'ANCESTRY_CYCLE')).toMatchObject({
      severity: 'error', recordIds: ['@F1@'], entityIds: ['rel-a', 'rel-b', 'rel-c'],
    })
  })

  it('allows a repeated ancestor and parallel records without interpreting them as a cycle', async () => {
    const data = minimal()
    for (const id of ['I2', 'I3', 'I4']) data.people.push({ ...data.people[0]!, id })
    data.relationships = [edge('rel-a', 'I1', 'I2'), edge('rel-b', 'I1', 'I3'), edge('rel-c', 'I2', 'I4'),
      edge('rel-d', 'I3', 'I4'), edge('rel-e', 'I3', 'I4')]
    const report = await validateData(data, options)
    expect(report.status).toBe('passed')
    expect(report.issues.some((issue) => issue.code === 'ANCESTRY_CYCLE')).toBe(false)
    expect(report.issues.some((issue) => issue.code === 'REPEATED_RELATIONSHIP')).toBe(true)
  })

  it('blocks newly introduced conflicting roles', async () => {
    const data = minimal()
    data.people.push({ ...data.people[0]!, id: 'I2' })
    data.relationships = [edge('rel-a', 'I1', 'I2'), edge('rel-b', 'I2', 'I1', 'spouse')]
    expect((await validateData(data, options)).issues).toContainEqual(expect.objectContaining({ code: 'CONFLICTING_ROLES', severity: 'error' }))
  })

  it('finds duplicate families even when child order differs', async () => {
    const { family, report: conversion } = synthetic()
    const original = conversion.rawFamilies[0]!
    original.childIds.push('@I1@')
    conversion.rawFamilies.push({ ...original, id: 'family-copy', recordId: '@F99@', childIds: [...original.childIds].reverse() })
    const result = await validateData(family, { ...options, conversion })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'POSSIBLE_DUPLICATE_FAMILY', severity: 'error', recordIds: ['@F1@', '@F99@'] }))
  })

  it.each(['1 _UNKNOWN important', '1 OBJE\n2 FILE missing.jpg', '1 BIRT\n2 SOUR\n3 _DETAIL lost'])('blocks unsupported information: %s', async (extra) => {
    const { family, report: conversion } = synthetic(extra)
    const report = await validateData(family, { ...options, conversion })
    expect(report.status).toBe('failed')
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_STRUCTURE', severity: 'error', recordIds: ['@I1@'], line: expect.any(Number) }))
  })

  it.each(['HEAD', 'CHAN', '_EVDEF'])('does not hide unknown data inside %s metadata', async (tag) => {
    let bytes = read('tests/fixtures/conversion/complex.ged').toString('utf8')
    if (tag === 'HEAD') bytes = bytes.replace('0 HEAD', '0 HEAD\n1 _UNKNOWN lost')
    else if (tag === 'CHAN') bytes = bytes.replace('1 NAME Тест /Однакове/', '1 NAME Тест /Однакове/\n1 CHAN\n2 _UNKNOWN lost')
    else bytes = bytes.replace('0 TRLR', '0 _EVDEF Test\n1 _UNKNOWN lost\n0 TRLR')
    const result = convertGedcom({ bytes: Buffer.from(bytes), config: minimal().config, supplements: { schemaVersion: 1 } })
    const report = await validateData(result.family, { ...options, conversion: result.report })
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'UNSUPPORTED_STRUCTURE', severity: 'error', line: expect.any(Number) }))
  })

  it.each([
    ['31 APR 1900', 'failed'], ['29 FEB 1901', 'failed'],
    ['@#DGREGORIAN@ 29 FEB 1900', 'failed'], ['@#DJULIAN@ 29 FEB 1900', 'passed'],
    ['29 FEB 1900', 'passed'], ['BET 1918 AND 1917', 'failed'],
    ['BET 1917 AND 23 JAN 1917', 'passed'], ['1917', 'passed'],
  ])('checks calendar bounds without adding precision: %s', async (raw, status) => {
    const data = minimal()
    data.events.push(eventSchema.parse({ id: 'event-test', kind: 'birth', participants: [{ personId: 'I1', role: 'subject' }], provenance }))
    data.claims.push(claimSchema.parse({ id: 'claim-test', field: 'date', target: { kind: 'event', id: 'event-test' }, value: convertDate(raw), provenance }))
    expect((await validateData(data, options)).status).toBe(status)
  })

  it('requires an existing regular declared file and matching signature', async () => {
    const parent = resolve(tmpdir())
    const directory = mkdtempSync(join(parent, 'rodovid-validation-'))
    if (dirname(resolve(directory)) !== parent || !directory.startsWith(join(parent, 'rodovid-validation-'))) throw new Error('Unexpected temp path')
    try {
      const data = minimal()
      data.media.push(mediaSchema.parse({ id: 'media-test', path: 'assets/test.pdf', mimeType: 'application/pdf', title: 'Test', provenance }))
      const validate = () => validateData(data, { assetsRoot: directory })
      expect((await validate()).issues).toContainEqual(expect.objectContaining({ code: 'INVALID_DECLARED_FILE', path: 'assets/test.pdf' }))
      mkdirSync(join(directory, 'assets'))
      writeFileSync(join(directory, 'assets/test.pdf'), '')
      expect((await validate()).status).toBe('failed')
      writeFileSync(join(directory, 'assets/test.pdf'), 'wrong content')
      expect((await validate()).status).toBe('failed')
      writeFileSync(join(directory, 'assets/test.pdf'), '%PDF-1.7\nsynthetic signature fixture')
      expect((await validate()).status).toBe('passed')
      data.media[0]!.path = 'assets/directory.pdf'
      mkdirSync(join(directory, 'assets/directory.pdf'))
      expect((await validate()).status).toBe('failed')
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })

  it.each(['photo', 'portrait', 'background', 'audio', 'pdf-page', 'image-region'])('checks media semantics for %s', async (role) => {
    const data = familyDataSchema.parse(json('tests/fixtures/data-contract/full.json'))
    if (role === 'photo') data.people[0]!.photoIds.push('media-audio')
    if (role === 'portrait') data.people[0]!.photoIds = []
    if (role === 'background') data.config.rooms[0]!.backgroundMediaId = 'media-audio'
    if (role === 'audio') data.config.audio.musicMediaIds = ['media-photo']
    if (role === 'pdf-page') {
      data.sources[0]!.mediaIds.push('media-photo')
      data.evidenceLinks[0]!.fragment = { mediaId: 'media-photo', page: 1 }
    }
    if (role === 'image-region') {
      data.evidenceLinks[0]!.fragment = { region: { x: 0, y: 0, width: 1, height: 1 } }
    }
    const report = await validateData(data, options)
    expect(report.issues).toContainEqual(expect.objectContaining({ code: role === 'portrait' ? 'PORTRAIT_NOT_IN_PHOTOS' : 'INVALID_MEDIA_ROLE' }))
  })
})
