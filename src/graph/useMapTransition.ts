import { useLayoutEffect, useRef, type RefObject } from 'react'
import { animate } from 'motion'
import { useMotionPreference } from '../appearance/context'
import type { MapSettings } from '../navigation/view-state'
import type { RadialLayout } from './layout'
import { connectionPath } from './presentation'
import { transitionDuration, transitionOffset, transitionOrigins, type PositionedPerson } from './transition'

/** One frame clock owns node positions and connection ports. The camera keeps its own transform. */
export function useMapTransition(container: RefObject<HTMLDivElement | null>, layout: RadialLayout, personId: string, camera: MapSettings) {
  const { reduced } = useMotionPreference()
  const displayed = useRef<{ personId: string; people: PositionedPerson[]; camera: MapSettings } | null>(null)
  useLayoutEffect(() => {
    const root = container.current!
    const layer = root.querySelector<SVGGElement>('[data-layer="coordinates"]')!
    const elements = [...root.querySelectorAll<SVGGElement>('[data-appearance-id]')]
    const edges = [...root.querySelectorAll<SVGGElement>('[data-relationship-id]')]
    const nodes = new Map(layout.nodes.map((node) => [node.appearanceId, node]))
    const previous = displayed.current
    const people = previous?.people.map((point) => ({ ...point,
      x: (point.x * previous.camera.zoom + previous.camera.pan.x - camera.pan.x) / camera.zoom,
      y: (point.y * previous.camera.zoom + previous.camera.pan.y - camera.pan.y) / camera.zoom,
    })) ?? []
    const origins = transitionOrigins(people, layout)
    const draw = (progress: number) => {
      const offsets = new Map(layout.nodes.map((node) => [node.appearanceId, transitionOffset(origins.get(node.appearanceId)!, node, progress)]))
      elements.forEach((element) => {
        const node = nodes.get(element.dataset.appearanceId!)!
        const offset = offsets.get(node.appearanceId)!
        element.setAttribute('transform', `translate(${offset.x} ${offset.y})`)
        const existed = people.some((person) => person.personId === node.personId)
        element.setAttribute('opacity', String(node.lane === 'center' ? 1 : (existed ? 0.35 : 0) + (existed ? 0.65 : 1) * (1 - (1 - progress) ** 3)))
      })
      edges.forEach((element, index) => {
        const edge = layout.edges[index]!
        const path = connectionPath(nodes.get(edge.fromAppearanceId)!, nodes.get(edge.toAppearanceId)!, layout.center,
          offsets.get(edge.fromAppearanceId), offsets.get(edge.toAppearanceId))
        element.querySelectorAll('path').forEach((part) => part.setAttribute('d', path))
        element.setAttribute('opacity', String(1 - (1 - progress) ** 3))
      })
      displayed.current = { personId, camera, people: layout.nodes.map((node) => {
        const offset = offsets.get(node.appearanceId)!
        return { personId: node.personId, appearanceId: node.appearanceId, x: node.x + offset.x, y: node.y + offset.y }
      }) }
      layer.dataset.transition = progress < 1 ? 'moving' : 'idle'
    }
    if (!previous || previous.personId === personId || reduced) { draw(1); return }
    draw(0)
    const animation = animate(0, 1, { duration: transitionDuration / 1000, ease: 'linear', onUpdate: draw, onComplete: () => draw(1) })
    return () => { animation.stop() }
  }, [container, layout, personId, camera, reduced])
}
