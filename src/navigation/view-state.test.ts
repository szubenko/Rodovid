import { describe, expect, it } from 'vitest'
import { initialView, viewReducer, type ViewAction } from './view-state'

const visit = (key: string, screen: 'tree' | 'horizontal' | 'person', personId: string, navigationType: 'POP' | 'PUSH' | 'REPLACE' = 'PUSH'): ViewAction =>
  ({ type: 'visit', key, route: { screen, personId }, navigationType })

describe('view history', () => {
  it('separates map cameras, retains horizontal mode through rooms and restores snapshots', () => {
    let state = initialView('I1', 3, 'a', { screen: 'tree', personId: 'I1' })
    state = viewReducer(state, { type: 'map', settings: { zoom: 2, pan: { x: 0.2, y: -0.1 }, generations: 5 } })
    const radial = state.current
    state = viewReducer(state, visit('b', 'horizontal', 'I1'))
    expect(state.current).toMatchObject({ mapScreen: 'horizontal', map: { zoom: 1, pan: { x: 0, y: 0 }, generations: 5 } })
    state = viewReducer(state, { type: 'map', settings: { zoom: 1.5 } })
    state = viewReducer(state, { type: 'relationship', id: 'evidence' })
    const horizontal = state.current
    state = viewReducer(state, visit('c', 'person', 'I1'))
    expect(state.current.mapScreen).toBe('horizontal')
    state = viewReducer(state, visit('b', 'horizontal', 'I1', 'POP'))
    expect(state.current).toEqual(horizontal)
    state = viewReducer(state, visit('a', 'tree', 'I1', 'POP'))
    expect(state.current).toEqual(radial)
    state = viewReducer(state, visit('d', 'horizontal', 'I2'))
    expect(state.current).toMatchObject({ centerPersonId: 'I2', map: { generations: 3, zoom: 1 } })
    expect(state.homePersonId).toBe('I1')
  })
  it('resets the home view from its room and restores that room snapshot on Back', () => {
    let state = initialView('I1', 3, 'a', { screen: 'tree', personId: 'I1' })
    state = viewReducer(state, { type: 'map', settings: { generations: 5, zoom: 2, pan: { x: 70, y: -30 }, collapsedAppearanceIds: ['branch'] } })
    state = viewReducer(state, visit('b', 'person', 'I1'))
    const room = state.current
    state = viewReducer(state, { type: 'visit', key: 'c', route: { screen: 'tree', personId: 'I1' }, navigationType: 'PUSH', resetMap: true })
    expect(state.current.map).toEqual({ generations: 3, zoom: 1, pan: { x: 0, y: 0 }, collapsedAppearanceIds: [] })
    state = viewReducer(state, visit('b', 'person', 'I1', 'POP'))
    expect(state.current).toEqual(room)
    state = viewReducer(state, visit('c', 'tree', 'I1', 'POP'))
    expect(state.current.map.zoom).toBe(1)
  })

  it('resets in place without adding a Back step and keeps the reset on Forward', () => {
    let state = initialView('I1', 3, 'a', { screen: 'tree', personId: 'I2' })
    state = viewReducer(state, visit('b', 'tree', 'I1'))
    state = viewReducer(state, { type: 'map', settings: { zoom: 2, generations: 6, pan: { x: 10, y: 50 }, collapsedAppearanceIds: ['branch'] } })
    state = viewReducer(state, { type: 'relationship', id: 'relation' })
    state = viewReducer(state, { type: 'reset-map' })
    expect(state.trail).toEqual(['a', 'b'])
    expect(state.current.map).toEqual({ generations: 3, zoom: 1, pan: { x: 0, y: 0 }, collapsedAppearanceIds: [] })
    expect(state.current.selectedRelationshipId).toBeNull()
    state = viewReducer(state, visit('a', 'tree', 'I2', 'POP'))
    state = viewReducer(state, visit('b', 'tree', 'I1', 'POP'))
    expect(state.current.map.zoom).toBe(1)
  })

  it('keeps home independent of the center and room person, resetting new centers', () => {
    let state = initialView('I1', 3, 'a', { screen: 'tree', personId: 'I1' })
    state = viewReducer(state, { type: 'map', settings: { zoom: 2, generations: 4 } })
    state = viewReducer(state, visit('b', 'person', 'I2'))
    expect(state.current).toMatchObject({ screen: 'person', personId: 'I2', centerPersonId: 'I1', map: { zoom: 2 } })
    state = viewReducer(state, visit('c', 'tree', 'I2'))
    expect(state.homePersonId).toBe('I1')
    expect(state.current).toMatchObject({ centerPersonId: 'I2', map: { zoom: 1, generations: 3 } })
  })

  it('restores each appearance of the same URL and its full map/relationship state on back and forward', () => {
    let state = initialView('I1', 3, 'a', { screen: 'tree', personId: 'I2' })
    state = viewReducer(state, { type: 'map', settings: { zoom: 2, pan: { x: 50, y: -10 }, collapsedAppearanceIds: ['branch-a'] } })
    state = viewReducer(state, { type: 'relationship', id: 'relation-a' })
    const first = state.current
    state = viewReducer(state, visit('b', 'tree', 'I3'))
    state = viewReducer(state, visit('c', 'tree', 'I2'))
    expect(state.current.map.zoom).toBe(1)
    state = viewReducer(state, visit('a', 'tree', 'I2', 'POP'))
    expect(state.current).toEqual(first)
    expect(state.position).toBe(0)
    state = viewReducer(state, visit('c', 'tree', 'I2', 'POP'))
    expect(state.current.map.zoom).toBe(1)
    expect(state.current.selectedRelationshipId).toBeNull()
  })

  it('replaces the root entry and discards forward navigation when branching', () => {
    let state = initialView('I1', 3, 'root', { screen: 'missing', personId: null })
    state = viewReducer(state, visit('a', 'tree', 'I1', 'REPLACE'))
    expect(state.trail).toEqual(['a'])
    state = viewReducer(state, visit('b', 'person', 'I2'))
    state = viewReducer(state, visit('a', 'tree', 'I1', 'POP'))
    state = viewReducer(state, visit('c', 'person', 'I3'))
    expect(state.trail).toEqual(['a', 'c'])
    expect(state.position).toBe(1)
  })

  it('starts direct rooms and unknown history entries without a back target', () => {
    let state = initialView('I1', 3, 'direct', { screen: 'person', personId: 'I2' })
    expect(state.current.centerPersonId).toBe('I2')
    expect(state.position).toBe(0)
    state = viewReducer(state, visit('old-session', 'tree', 'I3', 'POP'))
    expect(state.trail).toEqual(['old-session'])
    expect(state.current.personId).toBe('I3')
  })
})
