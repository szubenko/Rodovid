import type { RadialLayout } from './layout'
import type { SectorGeometry } from './presentation'

export type EmptySector = SectorGeometry & { ring: number; lane: 'parents' | 'spouses' | 'children'; label: string }

/** Presentation only: empty space must never become a person or a relationship. */
export function emptySectors(layout: RadialLayout, rings: number): EmptySector[] {
  const sectors: EmptySector[] = []
  for (let ring = 1; ring <= rings; ring++) {
    for (const lane of ['parents', ring === 1 ? 'spouses' : 'children'] as const) {
      const start = lane === 'parents' ? -108 : 116
      const end = lane === 'parents' ? 108 : 244
      const occupied = layout.nodes.filter((node) => node.ring === ring && node.lane === lane).sort((a, b) => a.startAngle - b.startAngle)
      const gaps: [number, number][] = []
      let cursor = start
      for (const node of occupied) {
        if (node.startAngle > cursor + 0.001) gaps.push([cursor, node.startAngle])
        cursor = Math.max(cursor, node.endAngle)
      }
      if (cursor < end - 0.001) gaps.push([cursor, end])
      for (const [a, b] of gaps) {
        // Bound decorative subdivisions even when the user explores twelve levels.
        const count = lane === 'parents' ? Math.max(1, Math.round((b - a) / 216 * Math.min(2 ** ring, 64))) : 1
        for (let index = 0; index < count; index++) {
          const startAngle = a + (b - a) * index / count
          const endAngle = a + (b - a) * (index + 1) / count
          const hidden = layout.nodes.some((node) => node.ring < ring
            && (node.lane === lane || node.lane === 'center')
            && (node.lane === 'center' || (node.startAngle <= startAngle && node.endAngle >= endAngle))
            && node.hiddenConnections.some((connection) => ['collapsed', 'limit', 'cycle'].includes(connection.reason)))
          const band = layout.ringRadii[ring]! - layout.ringRadii[ring - 1]!
          const innerRadius = layout.ringRadii[ring - 1]! + Math.min(3, band / 4)
          const outerRadius = layout.ringRadii[ring]!
          sectors.push({ ring, lane, startAngle, endAngle, innerRadius, outerRadius,
            labelRadius: (innerRadius + outerRadius) / 2 - 2, reverseLabel: lane !== 'parents',
            label: hidden ? 'Продовження приховано' : lane === 'spouses' ? 'Подружжя · немає відомостей'
              : lane === 'children' && ring === 2 ? 'Діти · немає відомостей' : 'Відомостей немає' })
        }
      }
    }
  }
  return sectors
}
