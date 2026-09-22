import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assertPreservedLines, verifyBaseline } from './baseline.ts'
import { children, inspectGedcom, values } from './parse.ts'

const baseline = readFileSync(new URL('../../tests/fixtures/baseline-2026-09-02/Zubenko.ged', import.meta.url))
const data = inspectGedcom(baseline)

describe('reviewed RootsMagic 5.5.1 export', () => {
  it('matches the reviewed hash, counts, every raw line, Unicode and reference targets', () => {
    expect(verifyBaseline(baseline, data).preservedLines).toBe(1156)
  })

  it('retains duplicate families and their children and marriages independently', () => {
    for (const [leftId, rightId, count] of [['@F6@', '@F7@', 7], ['@F8@', '@F9@', 6]] as const) {
      const left = data.families.find((family) => family.rawId === leftId)!
      const right = data.families.find((family) => family.rawId === rightId)!
      expect(left.childIds).toHaveLength(count)
      expect(right.childIds).toEqual(left.childIds)
      expect(right.husbands).toEqual(left.husbands)
      expect(right.wives).toEqual(left.wives)
      const marriages = data.events.filter((event) => event.ownerId === leftId || event.ownerId === rightId)
      expect(marriages).toHaveLength(2)
      expect(marriages[0]!.rawDates).toEqual(marriages[1]!.rawDates)
      expect(marriages[0]!.line).not.toBe(marriages[1]!.line)
    }
  })

  it('retains conflicting roles, incomplete dates and original place spellings', () => {
    expect(data.families.find((family) => family.rawId === '@F3@')!.wives).toContain('@I6@')
    expect(data.families.find((family) => family.rawId === '@F5@')!.childIds).toContain('@I6@')
    expect(data.events.find((event) => event.ownerId === '@I2@')!).toMatchObject({
      rawDates: ['1963'], rawPlaces: ['Chapliyïvka, Shostka, Sumy, Ukraine'],
    })
    expect(data.events.find((event) => event.ownerId === '@I3@')!.rawDates).toEqual([])
    expect(data.events.filter((event) => event.ownerId === '@I22@').map((event) => event.rawDates))
      .toEqual([['1917'], ['23 JAN 1917']])
  })

  it('keeps RootsMagic metadata out of life events and historical evidence', () => {
    expect(data.events.every((event) => event.ownerId !== null)).toBe(true)
    expect(data.sourceCitations).toEqual([])
    expect(data.extensions.filter((item) => item.tag === '_EVDEF')).toHaveLength(65)
    expect(data.extensions.filter((item) => item.tag === '_FSFTID')).toHaveLength(25)
    expect(data.unhandledNodes).toEqual([])
  })

  it('does not silently accept a replaced baseline', () => {
    const changed = Buffer.from(baseline.toString('utf8').replace('Сегрій', 'Сергій'))
    expect(() => verifyBaseline(changed, inspectGedcom(changed))).toThrow('Baseline GEDCOM changed')
  })

  it('detects raw-field loss even when the baseline counts match', () => {
    const tree = structuredClone(data.tree)
    children(children(tree, 'INDI')[0]!, 'NAME')[0]!.value = 'Сергій /Зубенко/'
    expect(() => assertPreservedLines(baseline, tree)).toThrow('Raw GEDCOM lines were changed or lost')
  })
})

// Entirely synthetic; exercises constructs absent from the family export.
const fixture = `0 HEAD
1 SOUR RootsMagic
1 GEDC
2 VERS 5.5.1
1 CHAR UTF-8
0 @I1@ INDI
1 NAME Тест /Особа/
1 NAME Альтернатива /Особа/
1 _FSFTID TEST-001
1 _NEW value
2 DETAIL вкладений текст
1 BIRT
2 DATE ABT 1900
2 PLAC Історична назва
2 SOUR @S1@
3 PAGE 12
3 QUAY 2
1 BIRT
2 DATE BET 1899 AND 1901
1 DEAT Y
1 EVEN
2 TYPE Інша подія
2 DATE @#DJULIAN@ 1 JAN 1900
1 NOTE Перший
2 CONC рядок
2 CONT Другий рядок
1 OBJE @O1@
0 @F1@ FAM
1 CHIL @I1@
1 CHIL @I1@
1 MARR
2 DATE FROM 1920 TO 1921
0 @S1@ SOUR
1 TITL Синтетичне джерело
0 @O1@ OBJE
1 FILE synthetic.jpg
0 _EVDEF BIRT
1 _LABEL Birth
0 TRLR
`

describe('preservation beyond the baseline', () => {
  it.each(['\n', '\r\n'])('preserves repeated facts, extensions, continuations and pointers with %j endings', (newline) => {
    const bytes = Buffer.from(fixture.replaceAll('\n', newline))
    const result = inspectGedcom(bytes)
    expect(assertPreservedLines(bytes, result.tree)).toBe(39)
    expect(result.people[0]!.names).toHaveLength(2)
    expect(result.events.map((event) => event.rawDates))
      .toEqual([['ABT 1900'], ['BET 1899 AND 1901'], [], ['FROM 1920 TO 1921']])
    expect(result.events[2]!.rawValue).toBe('Y')
    expect(result.families[0]!.childIds).toEqual(['@I1@', '@I1@'])
    expect(result.counts.sourceRecords).toBe(1)
    expect(result.counts.sourceCitations).toBe(1)
    expect(result.counts.mediaRecords).toBe(1)
    expect(result.sourceCitations[0]).toMatchObject({ path: 'INDI.BIRT.SOUR', value: '@S1@' })
    expect(result.extensions).toContainEqual(expect.objectContaining({
      path: 'INDI._NEW', value: 'value', handling: 'unhandled-preserved',
    }))
    expect(result.unhandledNodes.map((item) => item.path)).toEqual(expect.arrayContaining([
      'INDI._NEW', 'INDI._NEW.DETAIL', 'INDI.EVEN', 'INDI.EVEN.DATE',
      'INDI.NOTE.CONT', 'INDI.NOTE.CONC', 'INDI.OBJE', 'INDI.BIRT.SOUR.QUAY',
    ]))
    expect(values(children(result.people[0]!.node, 'EVEN')[0]!, 'DATE'))
      .toEqual(['@#DJULIAN@ 1 JAN 1900'])
  })

  it('accepts a UTF-8 BOM and a sliced buffer without leaking its backing bytes', () => {
    const bytes = Buffer.from(`prefix\uFEFF${fixture}suffix`)
    const view = bytes.subarray(6, bytes.length - 6)
    expect(assertPreservedLines(view, inspectGedcom(view).tree)).toBe(39)
  })

  it.each([
    'not a GEDCOM',
    fixture.replace('0 TRLR\n', ''),
    fixture.replace('1 _NEW value', 'not a valid line'),
  ])('rejects malformed input instead of returning a partial success', (source) => {
    expect(() => inspectGedcom(Buffer.from(source))).toThrow()
  })
})
