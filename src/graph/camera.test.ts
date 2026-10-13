import { describe, expect, it } from 'vitest'
import { fitCamera, scaleCamera } from './camera'

describe('camera zoom', () => {
  it('keeps the point under the viewport center fixed, including a panned view', () => {
    const camera = { zoom: 2, pan: { x: 0.2, y: -0.3 } }
    const next = scaleCamera(camera, 1.25)
    for (const axis of ['x', 'y'] as const) {
      expect((0.5 - next.pan[axis]) / next.zoom).toBeCloseTo((0.5 - camera.pan[axis]) / camera.zoom)
    }
    const restored = scaleCamera(next, 1 / 1.25)
    expect(restored.zoom).toBe(camera.zoom)
    expect(restored.pan.x).toBeCloseTo(camera.pan.x)
    expect(restored.pan.y).toBeCloseTo(camera.pan.y)
  })
  it('stops at both scale limits without moving the camera further', () => {
    const largest = scaleCamera({ zoom: 1, pan: { x: 0, y: 0 } }, 100)
    expect(largest.zoom).toBe(6)
    expect(scaleCamera(largest, 2)).toEqual(largest)
    const smallest = scaleCamera(largest, 0.001)
    expect(smallest.zoom).toBe(0.01)
    expect(scaleCamera(smallest, 0.5)).toEqual(smallest)
  })
  it('keeps the visible center fixed in a rectangular horizontal viewport', () => {
    const viewport = { x: 320, y: 440 }
    const camera = { zoom: 1, pan: { x: 0.1, y: 0.2 } }
    const next = scaleCamera(camera, 1.25)
    for (const axis of ['x', 'y'] as const) {
      const before = (viewport[axis] / 2 - camera.pan[axis] * viewport[axis]) / camera.zoom
      const after = (viewport[axis] / 2 - next.pan[axis] * viewport[axis]) / next.zoom
      expect(after).toBeCloseTo(before)
    }
  })
  it('maximizes a sparse drawing using its actual offset bounds on either viewport axis', () => {
    const bounds = { x: -300, y: 140, width: 1200, height: 600 }
    for (const [width, height] of [[1440, 900], [320, 668]]) {
      const camera = fitCamera(bounds, width!, height!)
      const left = bounds.x * camera.zoom + camera.pan.x * width!
      const top = bounds.y * camera.zoom + camera.pan.y * height!
      expect(left).toBeGreaterThanOrEqual(16)
      expect(top).toBeGreaterThanOrEqual(16)
      expect(left + bounds.width * camera.zoom).toBeLessThanOrEqual(width! - 16)
      expect(top + bounds.height * camera.zoom).toBeLessThanOrEqual(height! - 16)
      expect(Math.min(left, top)).toBeCloseTo(16)
      expect(left + bounds.width * camera.zoom / 2).toBeCloseTo(width! / 2)
      expect(top + bounds.height * camera.zoom / 2).toBeCloseTo(height! / 2)
    }
  })
})
