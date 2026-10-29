import type { FamilyGraph } from './projection'
import type { RelativeNode } from './relatives-layout'
import type { TreeLayout } from './tree-layout'

type Point = { x: number; y: number }
type Segment = { a: Point; b: Point }
type Interval = [number, number]
type Edge = TreeLayout['edges'][number]

function segments(path: string): Segment[] {
  let current = { x: 0, y: 0 }
  const result: Segment[] = []
  for (const match of path.matchAll(/([MVH])([^MVH]+)/gu)) {
    const values = match[2]!.split(',').map(Number)
    const next = { x: match[1] === 'V' ? current.x : values[0]!, y: match[1] === 'H' ? current.y : values.at(-1)! }
    if (match[1] !== 'M') result.push({ a: current, b: next })
    current = next
  }
  return result
}

function intersects(a: Segment, b: Segment) {
  if (a.a.y === a.b.y && b.a.x === b.b.x) return b.a.x >= Math.min(a.a.x, a.b.x) - .01
    && b.a.x <= Math.max(a.a.x, a.b.x) + .01 && a.a.y >= Math.min(b.a.y, b.b.y) - .01
    && a.a.y <= Math.max(b.a.y, b.b.y) + .01
  if (a.a.x === a.b.x && b.a.y === b.b.y) return intersects(b, a)
  return false
}

/** Find a rectilinear escape route around cards and existing family lines.
 * Directional sibling expansion can shift ancestors into another family's
 * row band; their connections need the same obstacle avoidance. */
function detour(start: Point, end: Point, cards: RelativeNode[], obstacles: Segment[], width: number, height: number): Point[] | null {
  const xs = new Set([8, width + 32, start.x, end.x]), ys = new Set([8, height + 32, start.y, end.y])
  const rectangles = cards.map(card => ({ left: card.x - card.width / 2 - 5, right: card.x + card.width / 2 + 5,
    top: card.y - card.height / 2 - 5, bottom: card.y + card.height / 2 + 5 }))
  for (const rect of rectangles) {
    xs.add(rect.left - 3); xs.add(rect.right + 3)
    ys.add(rect.top - 3); ys.add(rect.bottom + 3)
  }
  for (const { a, b } of obstacles) {
    for (const point of [a, b]) {
      xs.add(Math.max(8, point.x - 8)); xs.add(point.x + 8)
      ys.add(Math.max(8, point.y - 8)); ys.add(point.y + 8)
    }
  }
  const x = [...xs].sort((a, b) => a - b), y = [...ys].sort((a, b) => a - b)
  const merge = (intervals: Interval[]) => {
    intervals.sort((a, b) => a[0] - b[0])
    const result: Interval[] = []
    for (const interval of intervals) {
      const last = result.at(-1)
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1])
      else result.push([...interval])
    }
    return result
  }
  const horizontal = y.map(row => merge([
    ...rectangles.filter(rect => row >= rect.top && row <= rect.bottom).map(rect => [rect.left, rect.right] as Interval),
    ...obstacles.filter(({ a, b }) => row >= Math.min(a.y, b.y) - 2 && row <= Math.max(a.y, b.y) + 2)
      .map(({ a, b }) => [Math.min(a.x, b.x) - 2, Math.max(a.x, b.x) + 2] as Interval),
  ]))
  const vertical = x.map(column => merge([
    ...rectangles.filter(rect => column >= rect.left && column <= rect.right).map(rect => [rect.top, rect.bottom] as Interval),
    ...obstacles.filter(({ a, b }) => column >= Math.min(a.x, b.x) - 2 && column <= Math.max(a.x, b.x) + 2)
      .map(({ a, b }) => [Math.min(a.y, b.y) - 2, Math.max(a.y, b.y) + 2] as Interval),
  ]))
  const clear = (intervals: Interval[], a: number, b: number) => {
    const low = Math.min(a, b), high = Math.max(a, b)
    let left = 0, right = intervals.length
    while (left < right) {
      const middle = (left + right) >>> 1
      if (intervals[middle]![1] < low) left = middle + 1
      else right = middle
    }
    return left === intervals.length || intervals[left]![0] > high
  }
  const startIndex = y.indexOf(start.y) * x.length + x.indexOf(start.x)
  const endIndex = y.indexOf(end.y) * x.length + x.indexOf(end.x)
  // Distinguish arrival axes: equal-length Manhattan routes otherwise pick
  // arbitrary staircases through the grid. Charge a turn to prefer clear buses.
  const startState = startIndex * 3
  const distance = new Map([[startState, 0]]), previous = new Map<number, number>()
  const heap: { id: number; score: number }[] = []
  const push = (id: number, score: number) => {
    heap.push({ id, score })
    for (let index = heap.length - 1; index > 0;) {
      const parent = (index - 1) >>> 1
      if (heap[parent]!.score <= heap[index]!.score) break
      ;[heap[parent], heap[index]] = [heap[index]!, heap[parent]!]
      index = parent
    }
  }
  const pop = () => {
    const first = heap[0]!, last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      for (let index = 0;;) {
        let next = index
        for (const child of [index * 2 + 1, index * 2 + 2]) if (child < heap.length && heap[child]!.score < heap[next]!.score) next = child
        if (next === index) break
        ;[heap[index], heap[next]] = [heap[next]!, heap[index]!]
        index = next
      }
    }
    return first.id
  }
  const visited = new Set<number>()
  push(startState, 0)
  while (heap.length) {
    const id = pop()
    if (visited.has(id)) continue
    const pointIndex = Math.floor(id / 3), arrivalAxis = id % 3
    if (pointIndex === endIndex) {
      const route: Point[] = []
      for (let cursor: number | undefined = id; cursor !== undefined; cursor = previous.get(cursor)) {
        const point = Math.floor(cursor / 3)
        route.push({ x: x[point % x.length]!, y: y[Math.floor(point / x.length)]! })
      }
      return route.reverse().filter((_point, index, points) => index === 0 || index === points.length - 1
        || (points[index - 1]!.x !== points[index + 1]!.x && points[index - 1]!.y !== points[index + 1]!.y))
    }
    visited.add(id)
    const column = pointIndex % x.length, row = Math.floor(pointIndex / x.length)
    for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nextColumn = column + dc!, nextRow = row + dr!
      if (nextColumn < 0 || nextColumn >= x.length || nextRow < 0 || nextRow >= y.length) continue
      if (dc ? !clear(horizontal[row]!, x[column]!, x[nextColumn]!) : !clear(vertical[column]!, y[row]!, y[nextRow]!)) continue
      const axis = dc ? 1 : 2
      const next = (nextRow * x.length + nextColumn) * 3 + axis
      const candidate = distance.get(id)! + Math.abs(x[column]! - x[nextColumn]!) + Math.abs(y[row]! - y[nextRow]!)
        + (arrivalAxis && arrivalAxis !== axis ? 48 : 0)
      if (candidate >= (distance.get(next) ?? Infinity)) continue
      distance.set(next, candidate); previous.set(next, id)
      push(next, candidate + Math.abs(x[nextColumn]! - end.x) + Math.abs(y[nextRow]! - end.y))
    }
  }
  return null
}

export function routeSiblingDetours(edges: Edge[], nodes: RelativeNode[], graph: FamilyGraph, siblingIds: ReadonlySet<string>, width: number, height: number) {
  if (!siblingIds.size) return { width, height }
  const familyKey = (edge: Edge) => {
    const relation = graph.relationships.get(edge.relationshipId)!
    return (relation.kind === 'spouse' ? [relation.fromPersonId, relation.toPersonId]
      : [...new Set(graph.neighbors.get(relation.toPersonId)!.filter(neighbor => neighbor.direction === 'parents').map(neighbor => neighbor.personId))]).sort().join('|')
  }
  const keys = new Map(edges.map(edge => [edge, familyKey(edge)]))
  const byId = new Map(nodes.map(node => [node.appearanceId, node]))
  const generationByFamily = new Map(edges.map(edge => [keys.get(edge)!, byId.get(edge.toAppearanceId)!.generation]))
  const parsed = new Map<string, Segment[]>()
  const edgeSegments = (edge: Edge) => {
    let result = parsed.get(edge.path)
    if (!result) { result = segments(edge.path); parsed.set(edge.path, result) }
    return result
  }
  const siblingFamilies = new Set(edges.filter(edge => siblingIds.has(graph.relationships.get(edge.relationshipId)!.toPersonId))
    .map(edge => keys.get(edge)!))
  const crossesOtherFamily = (edge: Edge) => edges.some(other => keys.get(other) !== keys.get(edge)
    && edgeSegments(edge).some(a => edgeSegments(other).some(b => {
      // Collinear overlaps need separate channels. Orthogonal crossings can
      // use a small underpass gap instead of routing around the entire tree.
      if (a.a.y === a.b.y && b.a.y === b.b.y && Math.abs(a.a.y - b.a.y) < .01) {
        return Math.min(Math.max(a.a.x, a.b.x), Math.max(b.a.x, b.b.x))
          - Math.max(Math.min(a.a.x, a.b.x), Math.min(b.a.x, b.b.x)) > .01
      }
      if (a.a.x === a.b.x && b.a.x === b.b.x && Math.abs(a.a.x - b.a.x) < .01) {
        return Math.min(Math.max(a.a.y, a.b.y), Math.max(b.a.y, b.b.y))
          - Math.max(Math.min(a.a.y, a.b.y), Math.min(b.a.y, b.b.y)) > .01
      }
      return false
    })))
  const targets = new Set(edges.filter(edge => graph.relationships.get(edge.relationshipId)!.kind === 'parent-child'
    && crossesOtherFamily(edge)).map(edge => keys.get(edge)!)
    // Route younger families first. A long detour for an older marriage must
    // avoid their finished lines instead of enclosing their unfinished exits.
    .sort((a, b) => generationByFamily.get(b)! - generationByFamily.get(a)!
      || Number(siblingFamilies.has(b)) - Number(siblingFamilies.has(a))))
  for (const key of targets) {
    const family = edges.filter(edge => keys.get(edge) === key)
    if (!family.some(crossesOtherFamily)) continue
    for (const edge of family) {
      if (graph.relationships.get(edge.relationshipId)!.kind !== 'parent-child') continue
      const source = edgeSegments(edge)[0]!.a, child = byId.get(edge.toAppearanceId)!, parent = byId.get(edge.fromAppearanceId)!
      const destination = { x: child.x, y: child.y - child.height / 2 }
      const obstacles = edges.filter(other => keys.get(other) !== key).flatMap(edgeSegments)
      const end = { x: destination.x, y: destination.y - 8 }
      const score = (points: Point[]) => {
        let length = 0, turns = 0, axis = ''
        for (let index = 1; index < points.length; index++) {
          const a = points[index - 1]!, b = points[index]!
          if (a.x === b.x && a.y === b.y) continue
          const nextAxis = a.x === b.x ? 'V' : 'H'
          length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
          if (axis && axis !== nextAxis) turns++
          axis = nextAxis
        }
        return length + turns * 48
      }
      const route = detour({ x: source.x, y: source.y + 8 }, end, nodes, obstacles, width, height)
      let points = route ? [source, ...route, destination] : undefined
      // A different marriage's U-shaped join can enclose a bottom exit.
      // Escape from the card's side rather than circling the entire ancestry.
      const directDistance = Math.abs(source.x - destination.x) + Math.abs(source.y - destination.y)
      if (!points || score(points) > directDistance * 2 + 192) {
        const sideY = parent.y + parent.height / 2 - 32 + source.x - parent.x
        for (const side of [-1, 1]) {
          const port = { x: parent.x + side * parent.width / 2, y: sideY }
          const alternative = detour({ x: port.x + side * 8, y: port.y }, end, nodes, obstacles, width, height)
          if (!alternative) continue
          const candidate = [port, ...alternative, destination]
          if (!points || score(candidate) < score(points)) points = candidate
        }
      }
      if (!points) continue
      edge.path = `M${points[0]!.x},${points[0]!.y}` + points.slice(1).map((point, index) => point.x === points[index]!.x ? ` V${point.y}` : ` H${point.x}`).join('')
      width = Math.max(width, ...points.map(point => point.x + 28))
      height = Math.max(height, ...points.map(point => point.y + 28))
    }
  }
  const routes = new Map(edges.map(edge => [edge, edgeSegments(edge)]))
  for (const edge of edges) {
    const others = edges.filter(other => keys.get(other) !== keys.get(edge)).flatMap(other => routes.get(other)!)
    edge.path = routes.get(edge)!.flatMap(segment => {
      const { a, b } = segment
      if (a.x === b.x) return [`M${a.x},${a.y} V${b.y}`]
      const low = Math.min(a.x, b.x), high = Math.max(a.x, b.x)
      const gaps = others.filter(other => other.a.x === other.b.x && intersects(segment, other))
        .map(other => [Math.max(low, other.a.x - 7), Math.min(high, other.a.x + 7)] as Interval)
        .sort((left, right) => left[0] - right[0])
      const visible: Interval[] = []
      let cursor = low
      for (const [start, end] of gaps) {
        if (start > cursor) visible.push([cursor, start])
        cursor = Math.max(cursor, end)
      }
      if (cursor < high) visible.push([cursor, high])
      if (a.x > b.x) visible.reverse()
      return visible.map(([left, right]) => a.x < b.x
        ? `M${left},${a.y} H${right}` : `M${right},${a.y} H${left}`)
    }).join(' ')
  }
  return { width, height }
}
