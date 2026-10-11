import type { Appearance, Projection } from './projection'
import { labelBlock, type LabelBlock, type TextMeasure } from './text-block'

export type HorizontalNode = Appearance & { x: number; y: number; width: number; height: number; text: LabelBlock }
export type HorizontalLayout = { width: number; height: number; nodes: HorizontalNode[]; edges: (Projection['edges'][number] & { path: string })[] }

/** Order each generation independently, keeping close relatives near the center
 * even when distant generations are large. Spouses remain in the center column. */
export function layoutHorizontal(projection: Projection, labels: ReadonlyMap<string, string>, dates: ReadonlyMap<string, string>, measure: TextMeasure): HorizontalLayout {
  const padding = 28
  const gap = 24
  const blocks = new Map(projection.appearances.map(node => [node.appearanceId,
    labelBlock(labels.get(node.personId) ?? 'Ім’я невідоме', dates.get(node.personId) ?? '', 14, 12, measure, 190)]))
  const cardWidth = Math.max(224, ...[...blocks.values()].map(block => block.width + 40))
  const cardHeight = Math.max(104, ...[...blocks.values()].map(block => block.height + 40))
  const step = cardWidth + 80
  const columns = new Map<number, Appearance[]>()
  for (const node of projection.appearances) columns.set(node.generation, [...columns.get(node.generation) ?? [], node])
  const positions = new Map<string, { x: number; y: number }>()
  for (const [generation, nodes] of columns) nodes.forEach((node, index) => {
    positions.set(node.appearanceId, { x: generation * step,
      y: (index - (generation === 0 ? 0 : (nodes.length - 1) / 2)) * (cardHeight + gap) })
  })
  const minX = Math.min(...[...positions.values()].map(point => point.x)) - cardWidth / 2
  const minY = Math.min(...[...positions.values()].map(point => point.y)) - cardHeight / 2
  const nodes = projection.appearances.map((node): HorizontalNode => ({ ...node,
    x: positions.get(node.appearanceId)!.x - minX + padding,
    y: positions.get(node.appearanceId)!.y - minY + padding,
    width: cardWidth, height: cardHeight, text: blocks.get(node.appearanceId)!,
  }))
  const byId = new Map(nodes.map(node => [node.appearanceId, node]))
  const edges = projection.edges.map(edge => {
    const from = byId.get(edge.fromAppearanceId)!
    const to = byId.get(edge.toAppearanceId)!
    if (from.x === to.x) {
      const direction = Math.sign(to.y - from.y)
      const x = from.x - from.width / 2 + 16
      return { ...edge, path: `M${x},${from.y + direction * from.height / 2} V${to.y - direction * to.height / 2}` }
    }
    const direction = Math.sign(to.x - from.x)
    const startX = from.x + direction * from.width / 2
    const endX = to.x - direction * to.width / 2
    const middle = (startX + endX) / 2
    return { ...edge, path: `M${startX},${from.y} C${middle},${from.y} ${middle},${to.y} ${endX},${to.y}` }
  })
  return { nodes, edges, width: Math.max(...nodes.map(node => node.x + node.width / 2)) + padding,
    height: Math.max(...nodes.map(node => node.y + node.height / 2)) + padding }
}
