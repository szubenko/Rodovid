import type { FamilyData, Relationship } from '../data/schema'
import { buildFamilyGraph, type Direction } from '../graph/projection'

export type KinshipStep = { fromPersonId: string; personId: string; direction: Direction; relationships: Relationship[] }
export type KinshipPath = { steps: KinshipStep[]; signature: string; label: string }
export type KinshipResult = {
  homePersonId: string
  personId: string
  status: 'self' | 'missing' | 'unconnected' | 'related' | 'uncertain' | 'complex' | 'limited'
  label?: string
  paths: KinshipPath[]
  conflicting: boolean
  truncated: boolean
}

export const stepLabels = { parents: 'батько / мати', children: 'дитина', spouses: 'подружжя' } as const

function describe(steps: KinshipStep[]): KinshipPath {
  const directions = steps.map((step) => step.direction)
  if (directions.length === 1 && directions[0] === 'spouses') return { steps, signature: 'spouse', label: 'Чоловік / дружина' }
  if (directions.includes('spouses') || directions.some((direction, index) => direction === 'parents' && directions.slice(0, index).includes('children'))) {
    return { steps, signature: `chain:${directions.join(',')}`, label: 'Ланцюжок родинних зв’язків' }
  }
  const up = directions.filter((direction) => direction === 'parents').length
  const down = directions.length - up
  const label = down === 0 ? (['', 'Батько / мати', 'Дідусь / бабуся', 'Прадід / прабабуся'][up] ?? `Предок · ${up} поколінь`)
    : up === 0 ? (['', 'Син / донька', 'Онук / онука', 'Правнук / правнучка'][down] ?? `Нащадок · ${down} поколінь`)
    : up === 1 && down === 1 ? 'Брат / сестра (щонайменше один спільний батько або мати)'
    : up === 2 && down === 1 ? 'Дядько / тітка'
    : up === 1 && down === 2 ? 'Племінник / племінниця'
    : up === 2 && down === 2 ? 'Двоюрідний брат / двоюрідна сестра'
    : 'Ланцюжок родинних зв’язків'
  return { steps, signature: `${up}:${down}`, label }
}

/** Full-data blood paths go up to a common ancestor and then down, never up again.
 * Parallel records share a traversal step, retaining every original relationship.
 * A direct marriage is an independent role. For other connections show shortest
 * graph chains without inferring parenthood through a spouse. Budgets are explicit.
 */
export function explainKinship(family: FamilyData, personId: string, maxStates = 10000): KinshipResult {
  if (!Number.isInteger(maxStates) || maxStates < 1 || maxStates > 100000) throw new RangeError('Invalid kinship budget')
  const homePersonId = family.config.homePersonId
  const result: KinshipResult = { homePersonId, personId, status: 'unconnected', paths: [], conflicting: false, truncated: false }
  const graph = buildFamilyGraph(family)
  if (!graph.personIds.has(homePersonId) || !graph.personIds.has(personId)) return { ...result, status: 'missing' }
  if (personId === homePersonId) return { ...result, status: 'self', label: 'Це ви — домашня особа' }
  const neighbors = new Map([...graph.neighbors].map(([from, entries]) => {
    const grouped = new Map<string, KinshipStep>()
    for (const entry of entries) {
      const key = JSON.stringify([entry.personId, entry.direction])
      const step = grouped.get(key) ?? { fromPersonId: from, personId: entry.personId, direction: entry.direction, relationships: [] }
      step.relationships.push(graph.relationships.get(entry.relationshipId)!)
      grouped.set(key, step)
    }
    return [from, [...grouped.values()]]
  }))
  // Check connectivity separately: a search budget must never fabricate 'no path'.
  const reachable = new Set([homePersonId])
  for (const id of reachable) for (const step of neighbors.get(id)!) reachable.add(step.personId)
  if (!reachable.has(personId)) return result

  type State = { id: string; steps: KinshipStep[]; seen: Set<string>; descending: boolean }
  const root = (): State => ({ id: homePersonId, steps: [], seen: new Set([homePersonId]), descending: false })
  const queue = [root()]
  let states = 1
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!
    for (const step of neighbors.get(current.id)!) {
      if (step.direction === 'spouses' || (current.descending && step.direction === 'parents') || current.seen.has(step.personId)) continue
      if (states >= maxStates) { result.truncated = true; continue }
      states++
      const steps = [...current.steps, step]
      if (step.personId === personId) result.paths.push(describe(steps))
      else queue.push({ id: step.personId, steps, seen: new Set([...current.seen, step.personId]), descending: step.direction === 'children' })
    }
  }
  const spouse = neighbors.get(homePersonId)!.find((step) => step.personId === personId && step.direction === 'spouses')
  if (spouse) result.paths.push(describe([spouse]))

  if (result.paths.length === 0 && !result.truncated) {
    // Breadth-first shortest chains only for relationships outside the blood vocabulary.
    const pending = [root()]
    const distance = new Map([[homePersonId, 0]])
    let shortest = Infinity
    for (let cursor = 0; cursor < pending.length; cursor++) {
      const current = pending[cursor]!
      if (current.steps.length >= shortest) continue
      for (const step of neighbors.get(current.id)!) {
        const depth = current.steps.length + 1
        if (current.seen.has(step.personId) || (distance.get(step.personId) ?? Infinity) < depth) continue
        if (states >= maxStates) { result.truncated = true; continue }
        states++
        distance.set(step.personId, depth)
        const steps = [...current.steps, step]
        if (step.personId === personId) { shortest = depth; result.paths.push(describe(steps)) }
        else pending.push({ id: step.personId, steps, seen: new Set([...current.seen, step.personId]), descending: false })
      }
    }
  }
  result.paths.sort((a, b) => a.steps.length - b.steps.length)
  result.conflicting = new Set(result.paths.map((path) => path.signature)).size > 1
  const uncertain = result.paths.some((path) => path.steps.some((step) => step.relationships.some((relation) =>
    relation.reviewStatus !== 'accepted' || relation.confidence !== 'confirmed')))
  result.label = !result.conflicting ? result.paths[0]?.label : undefined
  result.status = result.truncated ? 'limited' : result.conflicting || uncertain ? 'uncertain'
    : result.label === 'Ланцюжок родинних зв’язків' ? 'complex' : 'related'
  return result
}
