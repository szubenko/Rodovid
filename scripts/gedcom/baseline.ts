import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import type { TreeNode } from 'read-gedcom'
import { children, values } from './parse.ts'
import type { GedcomInspection } from './parse.ts'

export const baselineSha256 = '02a5e903ed7e261e58b5866d01fde1af16867c2594a23480c21c4ef6d4fb4fdd'
export const baselineCounts = {
  people: 25, families: 9, events: 48, births: 22, deaths: 22, marriages: 4,
  familySearchIds: 25, childLinks: 32, eventDefinitions: 65,
  sourceRecords: 0, sourceCitations: 0, mediaRecords: 0,
}

/** Compare every physical line, including unknown fields, with the raw tree.
 * Only BOM and line terminators are excluded; no trimming or name cleanup. */
export function assertPreservedLines(bytes: Uint8Array, tree: TreeNode): number {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const expected = source.split(/\r\n|\n|\r/)
  if (expected.at(-1) === '') expected.pop()
  const actual: string[] = []
  function visit(node: TreeNode, level: number) {
    assert.equal(node.indexSource, actual.length, 'Source line order changed')
    actual.push(`${level}${node.pointer === null ? '' : ` ${node.pointer}`} ${node.tag}${node.value === null ? '' : ` ${node.value}`}`)
    node.children.forEach((child) => visit(child, level + 1))
  }
  tree.children.forEach((record) => visit(record, 0))
  assert.deepEqual(actual, expected, 'Raw GEDCOM lines were changed or lost')
  return actual.length
}

/** Intentionally pinned to the reviewed export, not a validator for new exports. */
export function verifyBaseline(bytes: Uint8Array, data: GedcomInspection) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  assert.equal(sha256, baselineSha256, 'Baseline GEDCOM changed; review the new export')
  assert.deepEqual(data.counts, baselineCounts)
  const lines = assertPreservedLines(bytes, data.tree)
  assert.deepEqual(values(children(data.header, 'GEDC')[0]!, 'VERS'), ['5.5.1'])
  assert.deepEqual(values(data.header, 'CHAR'), ['UTF-8'])
  assert.deepEqual(values(data.header, 'SOUR'), ['RootsMagic'])
  const home = data.people.find((person) => person.rawId === '@I1@')!
  assert.deepEqual(home.names, [{ raw: 'Сегрій /Зубенко/', given: ['Сегрій'], surname: ['Зубенко'] }])
  assert.deepEqual(home.familySearchIds, ['PFX8-NJ3'])
  assert.ok(data.people.every((person) => person.familySearchIds.length === 1 && person.familySearchIds[0]))
  assert.equal(new Set(data.people.flatMap((person) => person.familySearchIds)).size, 25)

  const personIds = new Set(data.people.map((person) => person.rawId))
  const familyIds = new Set(data.families.map((family) => family.rawId))
  assert.equal(personIds.size, 25)
  assert.equal(familyIds.size, 9)
  for (const family of data.families) {
    for (const id of [...family.husbands, ...family.wives, ...family.childIds]) {
      assert.ok(personIds.has(id), `Missing person ${id}`)
    }
  }
  for (const person of data.people) {
    for (const id of [...person.familyAsChild, ...person.familyAsSpouse]) {
      assert.ok(familyIds.has(id), `Missing family ${id}`)
    }
  }
  return { sha256, preservedLines: lines, counts: data.counts }
}
