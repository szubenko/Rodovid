import type { TreeNode } from 'read-gedcom'
import {
  claimSchema, eventSchema, familyDataSchema, personSchema, placeSchema,
  relationshipSchema, sourceSchema, evidenceLinkSchema, siteConfigSchema,
} from '../../src/data/schema.ts'
import type { Claim, FamilyData, FamilyEvent, Relationship } from '../../src/data/schema.ts'
import { children, inspectGedcom } from './parse.ts'
import { createIdentityRegistry } from './identities.ts'
import { convertDate } from './dates.ts'
import { mergeSupplements } from './supplements.ts'
import { assertPreservedLines } from './baseline.ts'

const individualEvents = new Set('BIRT CHR DEAT BURI CREM ADOP BAPM BARM BASM BLES CHRA CONF FCOM ORDN NATU EMIG IMMI CENS PROB WILL GRAD RETI EVEN RESI OCCU EDUC RELI TITL'.split(' '))
const familyEvents = new Set('ANUL CENS DIV DIVF ENGA MARB MARC MARR MARL MARS RESI EVEN'.split(' '))
const eventKinds: Record<string, FamilyEvent['kind']> = {
  BIRT: 'birth', DEAT: 'death', MARR: 'marriage', BAPM: 'baptism', CHR: 'baptism',
  BURI: 'burial', RESI: 'residence',
}
// Reviewed exporter metadata paths. Unknown descendants must still be reported;
// skipping an entire HEAD/CHAN/_EVDEF subtree could hide new source/media data.
const metadataPaths = new Set([
  'HEAD', 'HEAD.CHAR', 'HEAD.DATE', 'HEAD.DATE.TIME', 'HEAD.DEST', 'HEAD.FILE',
  'HEAD.GEDC', 'HEAD.GEDC.FORM', 'HEAD.GEDC.VERS', 'HEAD.SOUR', 'HEAD.SOUR.VERS',
  'HEAD.SOUR.NAME', 'HEAD.SOUR.CORP', 'HEAD.SOUR.CORP.ADDR', 'HEAD.SOUR.CORP.ADDR.CONT',
  'HEAD.SOUR.CORP.PHON', 'HEAD.SOUR.CORP.WWW', 'TRLR', 'CHAN', 'CHAN.DATE', 'CHAN.DATE.TIME',
  '_EVDEF', '_EVDEF.ABBR', '_EVDEF.DATE', '_EVDEF.DESC', '_EVDEF.PLAC', '_EVDEF.ROLE',
  '_EVDEF.ROLE.SENT', '_EVDEF.ROLE.SENT.CONC', '_EVDEF.SENT', '_EVDEF.SENT.CONC', '_EVDEF.TITL', '_EVDEF.TYPE',
])

export interface ConversionInput {
  bytes: Uint8Array
  config: unknown
  supplements: unknown
  identities?: unknown
  datasetKind?: FamilyData['datasetKind']
  supplementsFile?: string
}

/** Pure offline conversion: no input mutation, current time, filesystem writes or name matching. */
export function convertGedcom(input: ConversionInput) {
  const inspection = inspectGedcom(input.bytes)
  assertPreservedLines(input.bytes, inspection.tree)
  const registry = createIdentityRegistry(input.bytes, input.identities)
  const data: FamilyData = {
    schemaVersion: 1, datasetKind: input.datasetKind ?? 'family', config: siteConfigSchema.parse(input.config),
    people: [], relationships: [], events: [], claims: [], places: [], sources: [],
    media: [], evidenceLinks: [], memories: [],
  }
  const handled = new Set<TreeNode>()
  const locations = new Map<TreeNode, { recordId: string; path?: string }>()
  const records = new Map<string, TreeNode>()
  const warnings: { code: string; recordId?: string; path?: string; message: string }[] = []
  function walk(node: TreeNode, recordId: string, path?: string) {
    locations.set(node, { recordId, ...(path ? { path } : {}) })
    const occurrences = new Map<string, number>()
    for (const child of node.children) {
      const tag = child.tag!
      const index = occurrences.get(tag) ?? 0
      occurrences.set(tag, index + 1)
      walk(child, recordId, [path, `${tag}[${index}]`].filter(Boolean).join('.'))
    }
  }
  function markMetadata(node: TreeNode, path = node.tag!) {
    if (metadataPaths.has(path)) handled.add(node)
    for (const child of node.children) markMetadata(child, `${path}.${child.tag}`)
  }
  for (const record of inspection.tree.children) {
    if (record.pointer) {
      if (records.has(record.pointer)) throw new Error(`Duplicate GEDCOM record: ${record.pointer}`)
      records.set(record.pointer, record)
    }
    walk(record, record.pointer ?? record.tag!)
    if (['HEAD', 'TRLR', '_EVDEF'].includes(record.tag!)) markMetadata(record)
  }
  const gedc = inspection.header && children(inspection.header, 'GEDC')[0]
  const version = gedc && children(gedc, 'VERS')[0]?.value
  if (version !== '5.5.1') throw new Error(`Unsupported GEDCOM version: ${version ?? 'missing'}`)
  function loc(node: TreeNode) {
    const location = locations.get(node)
    if (!location) throw new Error(`Record without XREF at line ${node.indexSource + 1}`)
    return location
  }
  function origin(node: TreeNode) {
    return { kind: 'gedcom' as const, importId: registry.importId, ...loc(node) }
  }
  function id(kind: Parameters<typeof registry.resolve>[0], node: TreeNode, suffix?: string) {
    const location = loc(node)
    return registry.resolve(kind, location.recordId,
      suffix ? [location.path, suffix].filter(Boolean).join('.') : location.path)
  }
  function targetRecord(pointer: string | null, tag: string) {
    const record = pointer ? records.get(pointer) : undefined
    if (!record || record.tag !== tag) throw new Error(`Unresolved GEDCOM ${tag} reference: ${pointer}`)
    return record
  }
  function literal(node: TreeNode): string {
    handled.add(node)
    let value = node.value ?? ''
    for (const child of node.children) {
      if (child.tag === 'CONT') value += `\n${literal(child)}`
      if (child.tag === 'CONC') value += literal(child)
    }
    return value
  }
  function note(node: TreeNode, visited = new Set<TreeNode>()): string {
    if (visited.has(node)) throw new Error('Cyclic NOTE reference')
    visited.add(node)
    handled.add(node)
    return /^@[^@]+@$/.test(node.value ?? '')
      ? note(targetRecord(node.value, 'NOTE'), visited) : literal(node)
  }
  function field(node: TreeNode, tag: string) {
    return children(node, tag).map(literal).filter(Boolean).join('\n') || undefined
  }
  function notes(node: TreeNode) {
    return children(node, 'NOTE').map((entry) => note(entry)).filter(Boolean).join('\n') || undefined
  }
  function cite(node: TreeNode, target: { kind: 'person' | 'event' | 'claim' | 'relationship'; id: string }) {
    for (const citation of children(node, 'SOUR')) {
      handled.add(citation)
      const pointer = /^@[^@]+@$/.test(citation.value ?? '')
      const sourceId = pointer ? id('source', targetRecord(citation.value, 'SOUR')) : id('source', citation)
      if (!pointer && !data.sources.some((source) => source.id === sourceId)) {
        data.sources.push(sourceSchema.parse({ id: sourceId, title: literal(citation) || 'Джерело без назви',
          provenance: [origin(citation)] }))
      }
      const page = field(citation, 'PAGE')
      const quay = field(citation, 'QUAY')
      const texts = children(citation, 'DATA').flatMap((entry) => {
        handled.add(entry)
        return children(entry, 'TEXT').map(literal)
      })
      data.evidenceLinks.push(evidenceLinkSchema.parse({
        id: id('evidenceLink', citation, `${target.kind}:${target.id}`), sourceId, target,
        transcription: texts.join('\n') || undefined,
        explanation: [page && `PAGE: ${page}`, notes(citation)].filter(Boolean).join('\n') || undefined,
        quay: quay ? { raw: quay, value: /^[0-3]$/.test(quay) ? Number(quay) : undefined } : undefined,
        provenance: [origin(citation)],
      }))
    }
  }
  function addClaim(node: TreeNode, claim: Record<string, unknown>) {
    handled.add(node)
    const result = claimSchema.parse({ id: id('claim', node), provenance: [origin(node)], ...claim })
    data.claims.push(result)
    cite(node, { kind: 'claim', id: result.id })
    return result
  }
  function descriptions(node: TreeNode, target: Claim['target']) {
    for (const entry of children(node, 'NOTE')) {
      const value = note(entry)
      if (value) {
        const claim = addClaim(entry, { field: 'description', target, value })
        if (entry.value?.startsWith('@')) claim.provenance.push(origin(targetRecord(entry.value, 'NOTE')))
      }
    }
  }
  // Check forward family targets before reverse-link consistency, so a missing
  // person is diagnosed by its original XREF rather than a secondary mismatch.
  for (const family of inspection.families) {
    for (const pointer of [...family.husbands, ...family.wives, ...family.childIds]) targetRecord(pointer, 'INDI')
  }
  for (const source of children(inspection.tree, 'SOUR')) {
    handled.add(source)
    const description = ['AUTH', 'PUBL', 'TEXT'].map((tag) => {
      const value = field(source, tag)
      return value ? `${tag}: ${value}` : undefined
    })
    data.sources.push(sourceSchema.parse({
      id: id('source', source), title: field(source, 'TITL') ?? field(source, 'ABBR') ?? 'Джерело без назви',
      description: [...description, notes(source)].filter(Boolean).join('\n') || undefined,
      reference: field(source, 'REFN'), provenance: [origin(source)],
    }))
  }
  for (const person of inspection.people) {
    const node = person.node
    handled.add(node)
    const personId = id('person', node)
    // A death assertion can lack a date. An empty DEAT without details is not an assertion.
    const deaths = children(node, 'DEAT').filter((entry) => entry.value === 'Y'
      || (entry.value !== 'N' && entry.children.some((child) => ['DATE', 'PLAC', 'CAUS', 'SOUR'].includes(child.tag!))))
    data.people.push(personSchema.parse({ id: personId, lifeStatus: deaths.length ? 'deceased' : 'unknown',
      sex: person.sex.length === 1 && ['M', 'F', 'U'].includes(person.sex[0] ?? '') ? person.sex[0] : undefined,
      externalIds: ['_FSFTID', '_UID'].flatMap((tag) => children(node, tag).map((entry) => ({
        system: tag === '_FSFTID' ? 'FamilySearch' : 'RootsMagic-UID', value: literal(entry),
      }))), provenance: [origin(node), ...deaths.map(origin)],
    }))
    for (const name of children(node, 'NAME')) {
      const raw = literal(name)
      addClaim(name, { field: 'name', target: { kind: 'person', id: personId }, value: {
        raw, display: raw.replaceAll('/', '').replace(/\s+/g, ' ').trim(),
        given: field(name, 'GIVN'), surname: field(name, 'SURN'),
        prefix: field(name, 'NPFX'), suffix: field(name, 'NSFX'),
      }, explanation: notes(name) })
    }
    descriptions(node, { kind: 'person', id: personId })
    cite(node, { kind: 'person', id: personId })
    // Reverse links are checked against FAM, never used to invent another parent.
    for (const tag of ['FAMC', 'FAMS']) for (const link of children(node, tag)) {
      handled.add(link)
      const family = targetRecord(link.value, 'FAM')
      const roles = tag === 'FAMC' ? ['CHIL'] : ['HUSB', 'WIFE']
      if (!family.children.some((entry) => roles.includes(entry.tag!) && entry.value === node.pointer)) {
        throw new Error(`Inconsistent reverse ${tag} link: ${node.pointer} -> ${link.value}`)
      }
    }
    for (const change of children(node, 'CHAN')) markMetadata(change)
  }
  const rawFamilies: { id: string; recordId: string; husbands: (string | null)[]; wives: (string | null)[]; childIds: (string | null)[] }[] = []
  const familyRelations = new Map<TreeNode, Relationship[]>()
  for (const family of inspection.families) {
    const node = family.node
    handled.add(node)
    rawFamilies.push({ id: id('family', node), recordId: loc(node).recordId,
      husbands: family.husbands, wives: family.wives, childIds: family.childIds })
    const parents = [...children(node, 'HUSB'), ...children(node, 'WIFE')]
    const childNodes = children(node, 'CHIL')
    for (const link of [...parents, ...childNodes]) { handled.add(link); targetRecord(link.value, 'INDI') }
    const relations: Relationship[] = []
    function relation(kind: Relationship['kind'], from: TreeNode, to: TreeNode) {
      const relationId = registry.resolve('relationship', loc(node).recordId, `${loc(from).path}+${loc(to).path}`)
      const result = relationshipSchema.parse({ id: relationId, kind,
        fromPersonId: id('person', targetRecord(from.value, 'INDI')),
        toPersonId: id('person', targetRecord(to.value, 'INDI')),
        provenance: [origin(from), origin(to)],
      })
      relations.push(result)
      cite(node, { kind: 'relationship', id: result.id })
    }
    for (const husband of children(node, 'HUSB')) for (const wife of children(node, 'WIFE')) relation('spouse', husband, wife)
    for (const parent of parents) for (const child of childNodes) relation('parent-child', parent, child)
    data.relationships.push(...relations)
    familyRelations.set(node, relations)
    for (const change of children(node, 'CHAN')) markMetadata(change)
  }
  for (const record of inspection.tree.children.filter((node) => ['INDI', 'FAM'].includes(node.tag!))) {
    for (const event of record.children.filter((node) => (record.tag === 'INDI' ? individualEvents : familyEvents).has(node.tag!))) {
      handled.add(event)
      const eventId = id('event', event)
      const target = { kind: 'event' as const, id: eventId }
      const type = field(event, 'TYPE')
      const kind = eventKinds[event.tag!] ?? 'other'
      const participants = record.tag === 'INDI' ? [{ personId: id('person', record), role: 'subject' }]
        : [...children(record, 'HUSB'), ...children(record, 'WIFE')].map((entry) => ({
          personId: id('person', targetRecord(entry.value, 'INDI')), role: 'partner',
        }))
      if (!participants.length) throw new Error(`Family event has no explicit participants: ${loc(event).recordId} ${loc(event).path}`)
      data.events.push(eventSchema.parse({ id: eventId, kind, label: type ?? (kind === 'other' ? event.tag : undefined),
        participants, relationshipIds: (familyRelations.get(record) ?? []).filter((relation) => relation.kind === 'spouse').map((relation) => relation.id),
        provenance: [origin(event)],
      }))
      if (event.value && event.value !== 'Y') {
        addClaim(event, { field: 'description', target, value: literal(event) })
      }
      for (const date of children(event, 'DATE')) {
        const value = convertDate(literal(date))
        addClaim(date, { field: 'date', target, value, explanation: notes(date) })
        if (value.kind === 'phrase') warnings.push({ code: 'UNPARSED_DATE', ...loc(date), message: value.raw })
      }
      for (const place of children(event, 'PLAC')) {
        const originalName = literal(place)
        if (!originalName) continue
        // Each occurrence retains its own identity until an explicit place mapping exists.
        const placeId = id('place', place)
        data.places.push(placeSchema.parse({ id: placeId, originalName, provenance: [origin(place)] }))
        addClaim(place, { field: 'place', target, value: placeId })
      }
      for (const cause of children(event, 'CAUS')) addClaim(cause, { field: 'cause', target, value: literal(cause) })
      descriptions(event, target)
      cite(event, target)
    }
  }
  const unhandledNodes: { recordId: string | null; path?: string; tag: string; line: number; value: string | null }[] = []
  function reportUnhandled(node: TreeNode) {
    if (!handled.has(node)) unhandledNodes.push({ recordId: locations.get(node)?.recordId ?? node.pointer,
      path: locations.get(node)?.path, tag: node.tag!, line: node.indexSource + 1, value: node.value })
    node.children.forEach(reportUnhandled)
  }
  inspection.tree.children.forEach(reportUnhandled)
  const family = mergeSupplements(familyDataSchema.parse(data), input.supplements, input.supplementsFile)
  const identities = registry.finish()
  for (const raw of rawFamilies) {
    const peers = rawFamilies.filter((candidate) => candidate.id !== raw.id
      && JSON.stringify([candidate.husbands, candidate.wives, candidate.childIds]) === JSON.stringify([raw.husbands, raw.wives, raw.childIds]))
    if (peers.length) warnings.push({ code: 'POSSIBLE_DUPLICATE_FAMILY', recordId: raw.recordId,
      message: `Separate records retained: ${peers.map((peer) => peer.recordId).join(', ')}` })
  }
  return { family, identities, report: {
    importId: registry.importId, sha256: registry.sha256, rawCounts: inspection.counts,
    counts: { people: family.people.length, families: rawFamilies.length, childLinks: rawFamilies.reduce((sum, entry) => sum + entry.childIds.length, 0),
      relationships: family.relationships.length, events: family.events.length, claims: family.claims.length,
      places: family.places.length, sources: family.sources.length, media: family.media.length,
      evidenceLinks: family.evidenceLinks.length, memories: family.memories.length },
    rawFamilies, warnings, unhandledNodes,
    reviewNotes: [
      ...family.relationships.filter((entry) => entry.explanation).map((entry) => ({
        target: { kind: 'relationship', id: entry.id }, explanation: entry.explanation, provenance: entry.provenance,
      })),
      ...family.claims.filter((entry) => entry.explanation).map((entry) => ({
        target: { kind: 'claim', id: entry.id }, explanation: entry.explanation, provenance: entry.provenance,
      })),
      ...family.places.filter((entry) => entry.description).map((entry) => ({
        target: { kind: 'place', id: entry.id }, explanation: entry.description, provenance: entry.provenance,
      })),
    ],
  } }
}
