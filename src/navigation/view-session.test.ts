import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialView, viewReducer } from './view-state'
import { restoreViewSession, saveViewSession, viewSessionKey } from './view-session'

const people = new Set(['I1', 'I2', 'I12'])
const start = (key = 'a', screen: 'vertical-minimal' | 'person' = 'vertical-minimal', personId = 'I1') =>
  initialView('I1', 3, key, { screen, personId }, .6)

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('tab view session', () => {
  it('restores each diagram, camera, branches, density and selected relationship', () => {
    for (const screen of ['tree', 'horizontal', 'vertical', 'vertical-design', 'vertical-minimal', 'relatives'] as const) {
      const fallback = initialView('I1', 3, 'a', { screen, personId: 'I1' }, .6)
      let state = viewReducer(fallback, { type: 'map', settings: {
        generations: 5, zoom: 1.25, pan: { x: -.3, y: .45 }, collapsedAppearanceIds: ['appearance'],
        expandedSiblingIds: ['I12'], collapsedAncestorIds: ['I2'], compactCards: true,
        collapsedSiblingIds: ['I12'],
      } })
      state = viewReducer(state, { type: 'relationship', id: 'relationship' })
      saveViewSession(state)
      expect(restoreViewSession(fallback, people).current).toEqual(state.current)
    }
  })

  it('retains Back/Forward across reload, including reload after returning from another origin', () => {
    const first = viewReducer(start(), { type: 'map', settings: { zoom: 2 } })
    const room = viewReducer(first, { type: 'visit', key: 'b', route: { screen: 'person', personId: 'I12' }, navigationType: 'PUSH' })
    saveViewSession(room)
    const reloaded = restoreViewSession(start('b', 'person', 'I12'), people)
    expect(reloaded.position).toBe(1)
    expect(reloaded.current).toEqual(room.current)
    expect(viewReducer(reloaded, { type: 'visit', key: 'a', route: first.current, navigationType: 'POP' }).current).toEqual(first.current)
    const older = restoreViewSession(start(), people)
    expect(older.current).toEqual(first.current)
    expect(viewReducer(older, { type: 'visit', key: 'b', route: room.current, navigationType: 'POP' }).current).toEqual(room.current)
  })

  it('keeps direct URLs authoritative and starts unknown history entries fresh', () => {
    saveViewSession(viewReducer(start(), { type: 'map', settings: { zoom: 2 } }))
    for (const fallback of [start('new'), start('a', 'person'), start('a', 'vertical-minimal', 'I2')]) {
      expect(restoreViewSession(fallback, people)).toEqual(fallback)
    }
  })

  it('restores earlier session snapshots without saved diagram tabs', () => {
    const state = viewReducer(start(), { type: 'map', settings: { zoom: 2 } })
    sessionStorage.setItem(viewSessionKey, JSON.stringify({ version: 1, state: { ...state, diagramMaps: undefined } }))
    expect(restoreViewSession(start(), people).current).toEqual(state.current)
  })

  it('ignores incompatible configuration, removed people and invalid history', () => {
    const state = viewReducer(start(), { type: 'map', settings: { expandedSiblingIds: ['I12'] } })
    saveViewSession(state)
    expect(restoreViewSession(start(), new Set(['I2']))).toEqual(start())
    for (const changed of [ { homePersonId: 'I2' }, { initialGenerations: 4 }, { initialMapZoom: 1 },
      { position: 99 }, { trail: ['a', 'a'] }, { trail: ['a', 'missing'] } ]) {
      saveViewSession({ ...state, ...changed })
      expect(restoreViewSession(start(), people)).toEqual(start())
    }
  })

  it.each(['{', 'null', '{}', '{"version":2}', '{"version":1,"state":{}}'])('ignores damaged or obsolete storage: %s', value => {
    sessionStorage.setItem(viewSessionKey, value)
    expect(restoreViewSession(start(), people)).toEqual(start())
  })

  it('continues when storage is blocked or full', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('quota') },
    })
    expect(() => saveViewSession(start())).not.toThrow()
    expect(restoreViewSession(start(), people)).toEqual(start())
  })
})
