import { describe, expect, it } from 'vitest'
import { initialView, viewReducer, type ViewAction } from './view-state'

const visit = (key: string, screen: 'tree' | 'person', personId: string, navigationType: 'POP' | 'PUSH' | 'REPLACE' = 'PUSH'): ViewAction =>
  ({ type: 'visit', key, route: { screen, personId }, navigationType })

describe('view history', () => {
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
