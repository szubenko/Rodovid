import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { familyDataSchema } from '../data/schema'
import { layoutRadial } from './layout'
import { buildFamilyGraph, projectFamily } from './projection'
import { transitionOffset, transitionOrigins } from './transition'
import { connectionPath } from './presentation'

const graph = buildFamilyGraph(familyDataSchema.parse(fixture))
const layout = layoutRadial(projectFamily(graph, 'I1'), { width: 600, height: 600, labels: new Map() })

describe('coordinated map transition', () => {
  it('keeps exact appearances and deterministically matches repeated people after recentering', () => {
    const node = layout.nodes[0]!
    const previous = [
      { personId: node.personId, appearanceId: 'far', x: 0, y: 0 },
      { personId: node.personId, appearanceId: 'near', x: 290, y: 290 },
    ]
    expect(transitionOrigins(previous, layout).get(node.appearanceId)).toMatchObject({ x: 290, y: 290 })
    previous.push({ personId: node.personId, appearanceId: node.appearanceId, x: 20, y: 20 })
    expect(transitionOrigins(previous, layout).get(node.appearanceId)).toMatchObject({ x: 20, y: 20 })
    expect(transitionOrigins([], layout).get(node.appearanceId)).toMatchObject(layout.center)
  })

  it('starts at the displayed point, moves toward the target and ends exactly without residual offsets', () => {
    const origin = { x: 50, y: 100 }
    const target = { x: 300, y: 300 }
    expect(transitionOffset(origin, target, 0)).toEqual({ x: -250, y: -200 })
    expect(transitionOffset(origin, target, 0.5)).toEqual({ x: -31.25, y: -25 })
    expect(transitionOffset(origin, target, 2)).toEqual({ x: -0, y: -0 })
  })

  it('moves connection endpoints by exactly their node offsets', () => {
    const from = layout.nodes[0]!
    const to = layout.nodes.find((node) => node.ring === 1)!
    const coordinates = (path: string) => [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((match) => [Number(match[1]), Number(match[2])])
    const original = coordinates(connectionPath(from, to, layout.center))
    const shifted = coordinates(connectionPath(from, to, layout.center, { x: 11, y: -7 }, { x: -25, y: 40 }))
    expect(shifted[0]![0]! - original[0]![0]!).toBeCloseTo(11)
    expect(shifted[0]![1]! - original[0]![1]!).toBeCloseTo(-7)
    expect(shifted[1]![0]! - original[1]![0]!).toBeCloseTo(-25)
    expect(shifted[1]![1]! - original[1]![1]!).toBeCloseTo(40)
  })
})
