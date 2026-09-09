import { parseGedcom } from 'read-gedcom'
import type { TreeNode } from 'read-gedcom'

export const parserVersion = '0.3.2'

export function children(node: TreeNode, tag: string): TreeNode[] {
  return node.children.filter((child) => child.tag === tag)
}

export function values(node: TreeNode, tag: string): (string | null)[] {
  return children(node, tag).map((child) => child.value)
}

// This probe deliberately interprets only the baseline's event types. Other
// constructs remain in the tree and in unhandledNodes for ROD-005/006.
const mappedPaths = new Set([
  'INDI', 'INDI.NAME', 'INDI.NAME.GIVN', 'INDI.NAME.SURN', 'INDI.SEX',
  'INDI._UID', 'INDI._FSFTID', 'INDI.FAMC', 'INDI.FAMS',
  'FAM', 'FAM.HUSB', 'FAM.WIFE', 'FAM.CHIL',
  ...['INDI.BIRT', 'INDI.DEAT', 'FAM.MARR'].flatMap((path) => [
    path, `${path}.DATE`, `${path}.PLAC`,
  ]),
])

/** Offline, raw inspection model; this is not the site's normalized contract. */
export function inspectGedcom(bytes: Uint8Array) {
  // Copy only the view, never pass a pooled Node Buffer's entire backing store.
  const tree = parseGedcom(Uint8Array.from(bytes).buffer, {
    noIndex: true,
    noInlineContinuations: true,
    doFreeze: true,
  })
  const records = tree.children
  const header = children(tree, 'HEAD')[0]!
  const people = children(tree, 'INDI').map((node) => ({
    rawId: node.pointer,
    names: children(node, 'NAME').map((name) => ({
      raw: name.value, given: values(name, 'GIVN'), surname: values(name, 'SURN'),
    })),
    sex: values(node, 'SEX'),
    familySearchIds: values(node, '_FSFTID'),
    uids: values(node, '_UID'),
    familyAsChild: values(node, 'FAMC'),
    familyAsSpouse: values(node, 'FAMS'),
    node,
  }))
  const families = children(tree, 'FAM').map((node) => ({
    rawId: node.pointer,
    husbands: values(node, 'HUSB'),
    wives: values(node, 'WIFE'),
    childIds: values(node, 'CHIL'),
    node,
  }))
  const events = records.flatMap((record) => record.children
    .filter((node) => record.tag === 'INDI'
      ? node.tag === 'BIRT' || node.tag === 'DEAT'
      : record.tag === 'FAM' && node.tag === 'MARR')
    .map((node) => ({
      ownerId: record.pointer,
      tag: node.tag,
      line: node.indexSource + 1,
      rawValue: node.value,
      rawDates: values(node, 'DATE'),
      rawPlaces: values(node, 'PLAC'),
      node,
    })))

  type Occurrence = {
    tag: string; path: string; recordId: string | null
    line: number; value: string | null
  }
  const extensions: (Occurrence & { handling: string })[] = []
  const unhandledNodes: Occurrence[] = []
  const sourceCitations: Occurrence[] = []
  function visit(node: TreeNode, ancestors: string[], recordId: string | null) {
    const tags = [...ancestors, node.tag!]
    const path = tags.join('.')
    const occurrence = {
      tag: node.tag!, path, recordId, line: node.indexSource + 1, value: node.value,
    }
    const metadata = tags[0] === 'HEAD' || tags[0] === '_EVDEF'
      || tags[1] === 'CHAN' || tags[0] === 'TRLR'
    if (node.tag!.startsWith('_')) {
      extensions.push({ ...occurrence, handling: metadata ? 'metadata-preserved'
        : mappedPaths.has(path) ? 'raw-field-preserved' : 'unhandled-preserved' })
    }
    if (!metadata && !mappedPaths.has(path)) unhandledNodes.push(occurrence)
    // HEAD.SOUR is software metadata. Top-level SOUR records and nested
    // citations stay separate; neither is converted to a confidence rating.
    if (!metadata && ancestors.length > 0 && node.tag === 'SOUR') {
      sourceCitations.push(occurrence)
    }
    node.children.forEach((child) => visit(child, tags, recordId))
  }
  records.forEach((record) => visit(record, [], record.pointer))

  const counts = {
    people: people.length,
    families: families.length,
    events: events.length,
    births: events.filter((event) => event.tag === 'BIRT').length,
    deaths: events.filter((event) => event.tag === 'DEAT').length,
    marriages: events.filter((event) => event.tag === 'MARR').length,
    familySearchIds: people.reduce((sum, person) => sum + person.familySearchIds.length, 0),
    childLinks: families.reduce((sum, family) => sum + family.childIds.length, 0),
    eventDefinitions: children(tree, '_EVDEF').length,
    sourceRecords: children(tree, 'SOUR').length,
    sourceCitations: sourceCitations.length,
    mediaRecords: children(tree, 'OBJE').length,
  }
  return {
    tree, header, people, families, events, counts,
    extensions, unhandledNodes, sourceCitations,
  }
}

export type GedcomInspection = ReturnType<typeof inspectGedcom>
