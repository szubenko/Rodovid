import { useLayoutEffect, useRef, type Dispatch, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, zoomTransform, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import type { ViewAction } from '../navigation/view-state'
import { maxZoom, minZoom, type Camera } from './camera'

export function useMapCamera(container: RefObject<HTMLDivElement | null>, width: number, camera: Camera, dispatch: Dispatch<ViewAction>, height = width) {
  const suppressClickUntil = useRef(0)
  const synchronizing = useRef(false)
  const controller = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const cancelFrame = useRef<() => void>(() => {})
  useLayoutEffect(() => {
    const svg = container.current!.querySelector('svg')!
    const layer = svg.querySelector<SVGGElement>('[data-layer="camera"]')!
    const output = container.current!.closest('section')!.querySelector('output')
    const selection = select(svg)
    let active = true
    let frame = 0
    let pending: ZoomTransform | undefined
    let drawn: ZoomTransform | undefined
    let controlZoom: number | undefined
    let controls: { element: SVGGElement; position: string }[] = []
    let touchStart: { x: number; y: number } | undefined
    const cancel = () => {
      cancelAnimationFrame(frame)
      frame = 0
      pending = undefined
    }
    cancelFrame.current = cancel
    const draw = () => {
      frame = 0
      if (!pending || drawn === pending) return
      drawn = pending
      layer.setAttribute('transform', pending.toString())
      const percentage = `${Math.round(pending.k * 100)}%`
      if (output && output.textContent !== percentage) output.textContent = percentage
      if (controlZoom !== pending.k) {
        const scale = Math.min(3, 1 / pending.k)
        controls.forEach(({ element, position }) => element.setAttribute('transform', `${position} scale(${scale})`))
        controlZoom = pending.k
      }
    }
    const commit = () => {
      if (!active || !pending) return
      cancelAnimationFrame(frame)
      draw()
      const transform = pending
      pending = undefined
      dispatch({ type: 'map', settings: { zoom: transform.k,
        pan: { x: transform.x / width, y: transform.y / height } } })
    }
    // A new click/key may navigate or use a camera button before wheel's end timer.
    // Save that camera before React's handler reads it or records the history entry.
    const interrupt = () => { if (pending) flushSync(commit) }
    const behavior = zoom<SVGSVGElement, unknown>()
      .extent([[0, 0], [width, height]])
      .scaleExtent([minZoom, maxZoom])
      .clickDistance(6)
      // Keep wheel zoom gentle: d3's default Ctrl multiplier makes each notch jump 10× faster.
      .wheelDelta((event: WheelEvent) => -event.deltaY * (event.deltaMode === 1 ? 0.05 : event.deltaMode ? 1 : 0.002))
      // Wheel zoom works directly over the diagram, with or without Ctrl.
      .filter((event: MouseEvent) => event.type === 'wheel' || !event.button && !event.ctrlKey)
      .on('start', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (!active || synchronizing.current || !event.sourceEvent) return
        controls = [...svg.querySelectorAll<SVGGElement>('[data-camera-control]')].map(element => ({
          element, position: element.getAttribute('transform')!.replace(/\s*scale\([^)]*\)$/, ''),
        }))
        controlZoom = undefined
        svg.dispatchEvent(new Event('map-camera-start'))
      })
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (!active || synchronizing.current || !event.sourceEvent) return // React/history owns programmatic changes.
        // Only the camera layer moves during input; React saves the final view once.
        // Coalesce high-frequency mouse/touch/wheel events into one write per frame.
        pending = event.transform
        if (!frame) frame = requestAnimationFrame(draw)
      })
      .on('end', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        if (!synchronizing.current && event.sourceEvent) commit()
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
    document.addEventListener('pointerdown', interrupt, true)
    document.addEventListener('keydown', interrupt, true)
    return () => {
      active = false
      cancel()
      selection.on('.zoom', null)
      svg.removeEventListener('touchstart', start, true)
      svg.removeEventListener('touchmove', move, true)
      svg.removeEventListener('touchend', end, true)
      svg.removeEventListener('click', click, true)
      document.removeEventListener('pointerdown', interrupt, true)
      document.removeEventListener('keydown', interrupt, true)
    }
  }, [container, width, height, dispatch])

  useLayoutEffect(() => {
    const svg = container.current!.querySelector('svg')!
    // Synchronize d3's gesture origin after Back/Forward, buttons, recentering and resize.
    const target = zoomIdentity.translate(camera.pan.x * width, camera.pan.y * height).scale(camera.zoom)
    const current = zoomTransform(svg)
    if (current.x === target.x && current.y === target.y && current.k === target.k) return
    cancelFrame.current()
    synchronizing.current = true
    select(svg).call(controller.current!.transform, target)
    synchronizing.current = false
  }, [container, width, height, camera.pan.x, camera.pan.y, camera.zoom])
}
