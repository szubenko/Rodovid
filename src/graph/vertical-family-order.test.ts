import { expect, it } from 'vitest'
import { orderVerticalFamilies } from './vertical-family-order'

// Deterministic remarriage/partner-chain fixtures; expected orders captured from
// the original exhaustive search before optimizing its cost and state caches.
function fixture(seed: number) {
  let n = seed
  const pick = (max: number) => { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; return n % max }
  const rows = new Map(Array.from({ length: 4 }, (_, generation) => [generation,
    Array.from({ length: 3 }, (_, group) => ({ generation,
      ids: Array.from({ length: 1 + pick(3) }, (_, person) => `${generation}-${group}-${person}`),
    })),
  ]))
  const families = []
  for (let generation = 0; generation < 3; generation++) {
    const parents = rows.get(generation)!.flatMap(group => group.ids)
    for (const group of rows.get(generation + 1)!) {
      const a = pick(parents.length)
      families.push({ parents: [parents[a]!, parents[(a + 1) % parents.length]!], children: [...group.ids] })
    }
  }
  const chains = [...rows.values()].flatMap(row => row.filter(group => group.ids.length > 2).map(group => [...group.ids]))
  const pairs = [...rows.values()].flatMap(row => row.flatMap(group => group.ids.length > 1
    ? [[group.ids[0]!, group.ids[1]!] as const] : []))
  return { rows, families, chains, pairs }
}

const fixtures = [
  { seed: 1, mode: 0, expected: [
    '0-0-0 / 0-1-0 / 0-2-0 0-2-1 0-2-2',
    '1-0-0 1-0-1 / 1-1-0 1-1-1 / 1-2-0 1-2-1',
    '2-1-0 2-1-1 2-1-2 / 2-0-0 / 2-2-0',
    '3-0-0 3-0-1 / 3-2-0 / 3-1-0 3-1-1 3-1-2',
  ] },
  { seed: 1, mode: 1, expected: [
    '0-0-0 / 0-1-0 / 0-2-0 0-2-1 0-2-2',
    '1-0-0 1-0-1 / 1-1-0 1-1-1 / 1-2-0 1-2-1',
    '2-1-0 2-1-1 2-1-2 / 2-0-0 / 2-2-0',
    '3-0-0 3-0-1 / 3-2-0 / 3-1-0 3-1-1 3-1-2',
  ] },
  { seed: 1, mode: 2, expected: [
    '0-0-0 / 0-1-0 / 0-2-0 0-2-1 0-2-2',
    '1-0-0 1-0-1 / 1-1-0 1-1-1 / 1-2-0 1-2-1',
    '2-1-0 2-1-1 2-1-2 / 2-0-0 / 2-2-0',
    '3-0-0 3-0-1 / 3-2-0 / 3-1-0 3-1-1 3-1-2',
  ] },
  { seed: 7, mode: 0, expected: [
    '0-2-1 0-2-0 / 0-1-0 / 0-0-0',
    '1-0-0 1-0-1 / 1-2-0 / 1-1-0',
    '2-0-0 / 2-2-0 / 2-1-0 2-1-1 2-1-2',
    '3-1-0 / 3-2-0 3-2-1 3-2-2 / 3-0-0 3-0-1',
  ] },
  { seed: 7, mode: 1, expected: [
    '0-0-0 / 0-1-0 / 0-2-0 0-2-1',
    '1-2-0 / 1-1-0 / 1-0-0 1-0-1',
    '2-1-0 2-1-1 2-1-2 / 2-2-0 / 2-0-0',
    '3-0-0 3-0-1 / 3-1-0 / 3-2-0 3-2-1 3-2-2',
  ] },
  { seed: 7, mode: 2, expected: [
    '0-0-0 / 0-1-0 / 0-2-0 0-2-1',
    '1-2-0 / 1-1-0 / 1-0-0 1-0-1',
    '2-1-0 2-1-1 2-1-2 / 2-2-0 / 2-0-0',
    '3-0-0 3-0-1 / 3-2-0 3-2-1 3-2-2 / 3-1-0',
  ] },
  { seed: 19, mode: 0, expected: [
    '0-1-1 0-1-0 / 0-2-0 0-2-1 0-2-2 / 0-0-0',
    '1-0-0 / 1-2-0 / 1-1-1 1-1-0',
    '2-0-1 2-0-0 / 2-2-0 / 2-1-0',
    '3-0-0 / 3-1-0 / 3-2-0',
  ] },
  { seed: 19, mode: 1, expected: [
    '0-1-1 0-1-0 / 0-2-0 0-2-1 0-2-2 / 0-0-0',
    '1-0-0 / 1-2-0 / 1-1-1 1-1-0',
    '2-0-1 2-0-0 / 2-2-0 / 2-1-0',
    '3-0-0 / 3-1-0 / 3-2-0',
  ] },
  { seed: 19, mode: 2, expected: [
    '0-0-0 / 0-2-0 0-2-1 0-2-2 / 0-1-0 0-1-1',
    '1-1-0 1-1-1 / 1-2-0 / 1-0-0',
    '2-2-0 / 2-1-0 / 2-0-0 2-0-1',
    '3-2-0 / 3-1-0 / 3-0-0',
  ] },
]

it.each(fixtures)('preserves exhaustive family order (seed $seed, mode $mode)', ({ seed, mode, expected }) => {
  const { rows, families, chains, pairs } = fixture(seed)
  orderVerticalFamilies(rows, families, mode > 0, chains, mode === 2 ? pairs : [])
  expect([...rows.values()].map(row => row.map(group => group.ids.join(' ')).join(' / '))).toEqual(expected)
})
