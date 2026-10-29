import type { FamilyData, PersonAppearance, Relationship } from '../data/schema.ts'

export type Direction = 'parents' | 'spouses' | 'children'
export type Neighbor = { personId: string; relationshipId: string; direction: Direction }
export type FamilyGraph = {
  personIds: ReadonlySet<string>
  relationships: ReadonlyMap<string, Relationship>
  neighbors: ReadonlyMap<string, readonly Neighbor[]>
  sexByPerson: ReadonlyMap<string, FamilyData['people'][number]['sex']>
}

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0

/** Index every relationship independently, including disputed and duplicate families. */
export function buildFamilyGraph(data: Pick<FamilyData, 'people' | 'relationships'>): FamilyGraph {
  const personIds = new Set(data.people.map((person) => person.id))
  if (personIds.size !== data.people.length) throw new Error('Duplicate person ID')
  const relationships = new Map<string, Relationship>()
  const neighbors = new Map<string, Neighbor[]>([...personIds].map((id) => [id, []]))
  for (const relation of data.relationships) {
    if (relationships.has(relation.id)) throw new Error(`Duplicate relationship: ${relation.id}`)
    const from = neighbors.get(relation.fromPersonId)
    const to = neighbors.get(relation.toPersonId)
    if (!from || !to) throw new Error(`Missing endpoint: ${relation.id}`)
    relationships.set(relation.id, relation)
    from.push({ personId: relation.toPersonId, relationshipId: relation.id, direction: relation.kind === 'spouse' ? 'spouses' : 'children' })
    to.push({ personId: relation.fromPersonId, relationshipId: relation.id, direction: relation.kind === 'spouse' ? 'spouses' : 'parents' })
  }
  const sex = new Map(data.people.map((person) => [person.id, person.sex]))
  const parentOrder = (neighbor: Neighbor) => neighbor.direction === 'parents'
    ? ({ M: 0, F: 1, U: 2 }[sex.get(neighbor.personId) ?? 'U']) : 0
  for (const list of neighbors.values()) list.sort((a, b) => parentOrder(a) - parentOrder(b)
    || compare(a.personId, b.personId) || compare(a.relationshipId, b.relationshipId))
  return { personIds, relationships, neighbors, sexByPerson: sex }
}

export type HiddenConnection = Neighbor & { reason: 'depth' | 'collapsed' | 'cycle' | 'limit' | 'recenter' }
export type Appearance = PersonAppearance & {
  lane: 'center' | Direction
  ring: number
  parentAppearanceId: string | null
  relationshipId: string | null
  slotIndex: number
  slotCount: number
  cycle: boolean
  hiddenConnections: HiddenConnection[]
}
export type Projection = {
  centerPersonId: string
  generations: number
  appearances: Appearance[]
  edges: { relationshipId: string; fromAppearanceId: string; toAppearanceId: string }[]
  truncated: boolean
}
export type ProjectionOptions = {
  generations?: number
  collapsedAppearanceIds?: readonly string[]
  maxAppearances?: number
}

/** Follow ancestors and descendants separately: a parent's other children are
 * side relatives, and spouses never extend the direct line. */
export function directLinePersonIds(graph: FamilyGraph, personId: string): ReadonlySet<string> {
  const result = new Set([personId])
  for (const direction of ['parents', 'children'] as const) {
    const visited = new Set([personId])
    const queue = [personId]
    for (let index = 0; index < queue.length; index++) {
      for (const neighbor of graph.neighbors.get(queue[index]!) ?? []) {
        if (neighbor.direction !== direction || visited.has(neighbor.personId)) continue
        visited.add(neighbor.personId)
        result.add(neighbor.personId)
        queue.push(neighbor.personId)
      }
    }
  }
  return result
}

/** Highest occupied ring for this center, independent of temporarily collapsed branches.
 * Uses the same cycle detection and appearance budget as the rendered graph. */
export function availableGenerations(graph: FamilyGraph, centerPersonId: string): number {
  const full = projectFamily(graph, centerPersonId, { generations: 12 })
  return Math.max(1, ...full.appearances.map((appearance) => appearance.ring))
}

function boundedInteger(value: number, min: number, max: number, label: string) {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`Invalid ${label}: ${value}`)
  return value
}

// Length prefixes prevent collisions even when source IDs contain punctuation.
const token = (value: string) => `${value.length}:${value}`

/** Center is generation 0; ancestors negative, descendants positive, spouse unchanged.
 * Rings follow ROD-008: ancestors 1+, spouses 1, children 2+, so 3 means center + 2 rings.
 * Side branches open by recentering a parent, then choosing a child.
 */
export function projectFamily(graph: FamilyGraph, centerPersonId: string, options: ProjectionOptions = {}): Projection {
  if (!graph.personIds.has(centerPersonId)) throw new Error(`Unknown center: ${centerPersonId}`)
  const generations = boundedInteger(options.generations ?? 3, 1, 12, 'generations')
  const budget = boundedInteger(options.maxAppearances ?? 2000, 1, 10000, 'maxAppearances')
  const collapsed = new Set(options.collapsedAppearanceIds)
  const root: Appearance = {
    appearanceId: `appearance-${token(centerPersonId)}`, personId: centerPersonId, generation: 0,
    lane: 'center', ring: 0, parentAppearanceId: null, relationshipId: null,
    slotIndex: 0, slotCount: 1, cycle: false, hiddenConnections: [],
  }
  const result: Projection = { centerPersonId, generations, appearances: [root], edges: [], truncated: false }
  // Breadth-first expansion preserves the nearest relatives before consuming the safety budget.
  const queue = [{ appearance: root, path: new Set([centerPersonId]) }]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { appearance, path } = queue[cursor]!
    const all = graph.neighbors.get(appearance.personId)!
    const lanes: Direction[] = appearance.lane === 'center' ? ['parents', 'spouses', 'children']
      : appearance.lane === 'spouses' ? [] : [appearance.lane]
    for (const neighbor of all) {
      if (neighbor.relationshipId !== appearance.relationshipId && !lanes.includes(neighbor.direction)) {
        appearance.hiddenConnections.push({ ...neighbor, reason: 'recenter' })
      }
    }
    for (const lane of lanes) {
      const relatives = all.filter((neighbor) => neighbor.direction === lane)
      const ring = appearance.lane === 'center' ? (lane === 'children' ? 2 : 1) : appearance.ring + 1
      const slotCount = Math.max(lane === 'parents' ? 2 : 1, relatives.length)
      for (const [slotIndex, neighbor] of relatives.entries()) {
        const reason = collapsed.has(appearance.appearanceId) ? 'collapsed'
          : appearance.cycle ? 'cycle' : ring >= generations ? 'depth'
          : result.appearances.length >= budget ? 'limit' : undefined
        if (reason) {
          appearance.hiddenConnections.push({ ...neighbor, reason })
          if (reason === 'limit') result.truncated = true
          continue
        }
        const child: Appearance = {
          appearanceId: `${appearance.appearanceId}-${lane}-${token(neighbor.relationshipId)}`,
          personId: neighbor.personId,
          generation: appearance.generation + (lane === 'parents' ? -1 : lane === 'children' ? 1 : 0),
          lane, ring, parentAppearanceId: appearance.appearanceId, relationshipId: neighbor.relationshipId,
          slotIndex, slotCount, cycle: path.has(neighbor.personId), hiddenConnections: [],
        }
        result.appearances.push(child)
        const relation = graph.relationships.get(neighbor.relationshipId)!
        const forward = relation.fromPersonId === appearance.personId
        result.edges.push({ relationshipId: relation.id,
          fromAppearanceId: forward ? appearance.appearanceId : child.appearanceId,
          toAppearanceId: forward ? child.appearanceId : appearance.appearanceId })
        queue.push({ appearance: child, path: new Set([...path, neighbor.personId]) })
      }
    }
  }
  return result
}
