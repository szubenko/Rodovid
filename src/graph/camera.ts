import type { MapSettings } from '../navigation/view-state'

export type Camera = Pick<MapSettings, 'zoom' | 'pan'>
export const minZoom = 0.01
export const maxZoom = 6

/** Largest camera scale that keeps the actual drawing inside both viewport axes. */
export function fitCamera(bounds: { x: number; y: number; width: number; height: number }, width: number, height: number): Camera {
  const zoom = Math.max(minZoom, Math.min(maxZoom, (width - 32) / bounds.width, (height - 32) / bounds.height))
  return { zoom, pan: { x: 0.5 - (bounds.x + bounds.width / 2) * zoom / width,
    y: 0.5 - (bounds.y + bounds.height / 2) * zoom / height } }
}

/** Pan uses fractions of each viewport dimension, so resize and history preserve the view. */
export function scaleCamera(camera: Camera, factor: number, center = { x: 0.5, y: 0.5 }): Camera {
  const zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * factor))
  const ratio = zoom / camera.zoom
  return { zoom, pan: { x: center.x - (center.x - camera.pan.x) * ratio, y: center.y - (center.y - camera.pan.y) * ratio } }
}
