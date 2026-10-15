import { useLayoutEffect, useRef, type Dispatch, type RefObject } from 'react'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomBehavior } from 'd3-zoom'
import type { ViewAction } from '../navigation/view-state'
import { maxZoom, minZoom, type Camera } from './camera'

export function useMapCamera(container: RefObject<HTMLDivElement | null>, width: number, camera: Camera, dispatch: Dispatch<ViewAction>, height = width) {
  const suppressClickUntil = useRef(0)
  const synchronizing = useRef(false)
  const controller = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  useLayoutEffect(() => {
    const svg = container.current!.querySelector('svg')!
    const selection = select(svg)
    let active = true
    let touchStart: { x: number; y: number } | undefined
    const behavior = zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [width, height]])
      .scaleExtent([minZoom, maxZoom])
      .clickDistance(6)
      // Keep wheel zoom gentle: d3's default Ctrl multiplier makes each notch jump 10× faster.
      .wheelDelta((event: WheelEvent) => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002))
      // Wheel zoom works directly over the diagram, with or without Ctrl.
      .filter((event: MouseEvent) => event.type === 'wheel' || !event.button && !event.ctrlKey)
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (!active || synchronizing.current || !event.sourceEvent) return // React/history owns programmatic changes.
        dispatch({ type: 'map', settings: { zoom: event.transform.k,
          pan: { x: event.transform.x / width, y: event.transform.y / height } } })
      })
    selection.call(behavior).on('dblclick.zoom', null)
    controller.current = behavior
    const start = (event: TouchEvent) => {
      const touch = event.touches[0]
      touchStart = touch ? { x: touch.clientX, y: touch.clientY } : undefined
      if (event.touches.length > 1) suppressClickUntil.current = performance.now() + 700
    }
    const move = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (touchStart && touch && (event.touches.length > 1 || Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y) > 6)) {
        suppressClickUntil.current = performance.now() + 700
      }
    }
    const end = () => {
      if (suppressClickUntil.current > performance.now()) suppressClickUntil.current = performance.now() + 700
    }
    // Capture precedes d3's stopImmediatePropagation; suppress compatibility clicks after a drag/pinch.
    const click = (event: MouseEvent) => {
      if (event.detail > 0 && performance.now() < suppressClickUntil.current) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    svg.addEventListener('touchstart', start, { capture: true, passive: true })
    svg.addEventListener('touchmove', move, { capture: true, passive: true })
    svg.addEventListener('touchend', end, { capture: true, passive: true })
    svg.addEventListener('click', click, true)
    return () => {
      active = false
      selection.on('.zoom', null)
      svg.removeEventListener('touchstart', start, true)
      svg.removeEventListener('touchmove', move, true)
      svg.removeEventListener('touchend', end, true)
      svg.removeEventListener('click', click, true)
    }
  }, [container, width, height, dispatch])

  useLayoutEffect(() => {
    const svg = container.current!.querySelector('svg')!
    // Synchronize d3's gesture origin after Back/Forward, buttons, recentering and resize.
    const target = zoomIdentity.translate(camera.pan.x * width, camera.pan.y * height).scale(camera.zoom)
    const current = zoomTransform(svg)
    if (current.x === target.x && current.y === target.y && current.k === target.k) return
    synchronizing.current = true
    select(svg).call(controller.current!.transform, target)
    synchronizing.current = false
  }, [container, width, height, camera.pan.x, camera.pan.y, camera.zoom])
}
