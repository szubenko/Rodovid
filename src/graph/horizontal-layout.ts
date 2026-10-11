import type { Appearance, Projection } from './projection'
import { labelBlock, type LabelBlock, type TextMeasure } from './text-block'

export type HorizontalNode = Appearance & { x: number; y: number; width: number; height: number; text: LabelBlock }
export type HorizontalLayout = { width: number; height: number; nodes: HorizontalNode[]; edges: (Projection['edges'][number] & { path: string })[] }

/** Lay out whole branches before their joining person, so each person faces the
 * midpoint of their direct relatives. Spouses remain in the center column. */
export function layoutHorizontal(projection: Projection, labels: ReadonlyMap<string, string>, dates: ReadonlyMap<string, string>, measure: TextMeasure): HorizontalLayout {
  const padding = 28
  const gap = 24
  const blocks = new Map(projection.appearances.map(node => [node.appearanceId,
    labelBlock(labels.get(node.personId) ?? 'Ім’я невідоме', dates.get(node.personId) ?? '', 14, 12, measure, 190)]))
  const cardWidth = Math.max(224, ...[...blocks.values()].map(block => block.width + 40))
  const cardHeight = Math.max(104, ...[...blocks.values()].map(block => block.height + 40))
  const step = cardWidth + 80
  const branches = new Map<string, Appearance[]>()
  for (const node of projection.appearances) if (node.parentAppearanceId && node.lane !== 'spouses') {
    const key = `${node.parentAppearanceId}/${node.lane}`
    branches.set(key, [...branches.get(key) ?? [], node])
  }
  const root = projection.appearances[0]!
  const positions = new Map<string, { x: number; y: number }>([[root.appearanceId, { x: 0, y: 0 }]])
  for (const lane of ['parents', 'children'] as const) {
    let nextRow = 0
    const midpoint = (nodes: Appearance[]) => (positions.get(nodes[0]!.appearanceId)!.y
      + positions.get(nodes.at(-1)!.appearanceId)!.y) / 2
    const place = (node: Appearance) => {
      const relatives = branches.get(`${node.appearanceId}/${lane}`) ?? []
      relatives.forEach(place)
      positions.set(node.appearanceId, { x: -node.generation * step,
        y: relatives.length ? midpoint(relatives) : nextRow++ * (cardHeight + gap) })
    }
    const relatives = branches.get(`${root.appearanceId}/${lane}`) ?? []
    relatives.forEach(place)
    if (relatives.length) {
      const origin = midpoint(relatives)
      for (const node of projection.appearances) if (node.lane === lane) {
        const position = positions.get(node.appearanceId)!
        positions.set(node.appearanceId, { ...position, y: position.y - origin })
      }
    }
  }
  projection.appearances.filter(node => node.lane === 'spouses').forEach((node, index) => {
    positions.set(node.appearanceId, { x: 0, y: (index + 1) * (cardHeight + gap) })
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
