import { branchTone, type BranchTone, type RadialLayout } from './layout'
import type { SectorGeometry } from './presentation'

export type EmptySector = SectorGeometry & { ring: number; lane: 'parents'; label: string; tone: BranchTone }

/** Only complete missing sibling slots beside known ancestors. A finished
 * branch never creates a chain of decorative rings or lower empty circles. */
export function emptySectors(layout: RadialLayout, rings: number): EmptySector[] {
  const sectors: EmptySector[] = []
  for (const parent of layout.nodes) {
    const ring = parent.ring + 1
    if (ring > rings || !['center', 'parents'].includes(parent.lane)) continue
    const children = layout.nodes.filter((node) => node.parentAppearanceId === parent.appearanceId && node.lane === 'parents')
      .sort((a, b) => a.startAngle - b.startAngle)
    if (!children.length) continue
    const start = parent.lane === 'center' ? -108 : parent.startAngle
    const end = parent.lane === 'center' ? 108 : parent.endAngle
    const gaps: [number, number, number][] = []
    let cursor = start
    let slot = 0
    for (const child of children) {
      if (child.startAngle > cursor + 0.001) gaps.push([cursor, child.startAngle, slot])
      cursor = child.endAngle
      slot = child.slotIndex + 1
    }
    if (cursor < end - 0.001) gaps.push([cursor, end, slot])
    for (const [startAngle, endAngle, slotIndex] of gaps) {
      const innerRadius = layout.ringRadii[ring - 1]! + 3 * layout.textScale
      const outerRadius = layout.ringRadii[ring]!
      sectors.push({ ring, lane: 'parents', startAngle, endAngle, innerRadius, outerRadius,
        tone: branchTone('parents', ring, slotIndex, parent.tone),
        labelRadius: (innerRadius + outerRadius) / 2, reverseLabel: false, label: 'Відомостей немає' })
    }
  }
  return sectors
}
