import { describe, expect, it } from 'vitest'
import { scaleCamera } from './camera'

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
    expect(smallest.zoom).toBe(0.05)
    expect(scaleCamera(smallest, 0.5)).toEqual(smallest)
  })
  it('keeps the visible center fixed in a rectangular horizontal viewport', () => {
    const center = { x: 0.5, y: 440 / 320 / 2 }
    const camera = { zoom: 1, pan: { x: 0.1, y: 0.2 } }
    const next = scaleCamera(camera, 1.25, center)
    for (const axis of ['x', 'y'] as const) {
      expect((center[axis] - next.pan[axis]) / next.zoom).toBeCloseTo((center[axis] - camera.pan[axis]) / camera.zoom)
    }
  })
})
