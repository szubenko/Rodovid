/** Wide touch targets can overlap when the whole tree is fitted on a phone.
 * Resolve the click to the nearest visible line in screen coordinates. */
export function closestRelationship(root: Element, x: number, y: number): string | undefined {
  let closest: string | undefined
  let distance = Infinity
  for (const path of root.querySelectorAll<SVGPathElement>('[data-relationship-id] path[data-hit]')) {
    const matrix = path.getScreenCTM()
    if (!matrix) continue
    const length = path.getTotalLength()
    const steps = Math.max(1, Math.ceil(length * Math.hypot(matrix.a, matrix.b) / 3))
    let previous = path.getPointAtLength(0).matrixTransform(matrix)
    for (let step = 1; step <= steps; step++) {
      const current = path.getPointAtLength(length * step / steps).matrixTransform(matrix)
      const dx = current.x - previous.x, dy = current.y - previous.y
      const fraction = Math.max(0, Math.min(1, ((x - previous.x) * dx + (y - previous.y) * dy) / (dx * dx + dy * dy || 1)))
      const candidate = Math.hypot(x - previous.x - fraction * dx, y - previous.y - fraction * dy)
      if (candidate < distance) {
        distance = candidate
        closest = path.parentElement?.getAttribute('data-relationship-id') ?? undefined
      }
      previous = current
    }
  }
  return closest
}
