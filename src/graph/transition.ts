import type { Point, RadialLayout } from './layout'

export type PositionedPerson = Point & { personId: string; appearanceId: string }
export const transitionDuration = 420

/** Match the same appearance first; after recentering, choose the nearest appearance of that person. */
export function transitionOrigins(previous: PositionedPerson[], target: RadialLayout): Map<string, Point> {
  return new Map(target.nodes.map((node) => {
    const same = previous.find((entry) => entry.appearanceId === node.appearanceId)
    const candidates = previous.filter((entry) => entry.personId === node.personId)
    const nearest = candidates.sort((a, b) => Math.hypot(a.x - node.x, a.y - node.y) - Math.hypot(b.x - node.x, b.y - node.y))[0]
    return [node.appearanceId, same ?? nearest ?? node]
  }))
}

export function transitionOffset(origin: Point, target: Point, progress: number): Point {
  const remaining = (1 - Math.max(0, Math.min(1, progress))) ** 3
  return { x: (origin.x - target.x) * remaining, y: (origin.y - target.y) * remaining }
}
