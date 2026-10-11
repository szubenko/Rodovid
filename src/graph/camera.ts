import type { MapSettings } from '../navigation/view-state'

export type Camera = Pick<MapSettings, 'zoom' | 'pan'>
export const minZoom = 0.05
export const maxZoom = 6

/** Pan uses fractions of the viewport width, so resize and history preserve the view. */
export function scaleCamera(camera: Camera, factor: number, center = { x: 0.5, y: 0.5 }): Camera {
  const zoom = Math.max(minZoom, Math.min(maxZoom, camera.zoom * factor))
  const ratio = zoom / camera.zoom
  return { zoom, pan: { x: center.x - (center.x - camera.pan.x) * ratio, y: center.y - (center.y - camera.pan.y) * ratio } }
}
