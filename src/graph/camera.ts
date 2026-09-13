import type { MapSettings } from '../navigation/view-state'

export type Camera = Pick<MapSettings, 'zoom' | 'pan'>
export const minZoom = 0.5
export const maxZoom = 6

/** Pan uses fractions of the square viewport, so resize and history preserve the view. */
export function scaleCamera(camera: Camera, factor: number): Camera {
  const zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * factor))
  const ratio = zoom / camera.zoom
  return { zoom, pan: { x: 0.5 - (0.5 - camera.pan.x) * ratio, y: 0.5 - (0.5 - camera.pan.y) * ratio } }
}
