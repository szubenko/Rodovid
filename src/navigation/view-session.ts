import { z } from 'zod'
import { viewReducer, type ViewState } from './view-state'

export const viewSessionKey = 'rodovid:view-session:v1'

const mapScreen = z.enum(['tree', 'horizontal', 'vertical', 'vertical-design', 'vertical-minimal', 'relatives'])
const view = z.object({
  screen: z.enum([...mapScreen.options, 'person', 'missing']),
  personId: z.string().nullable(),
  mapScreen,
  centerPersonId: z.string(),
  selectedRelationshipId: z.string().nullable(),
  map: z.object({
    generations: z.number().int().positive(),
    zoom: z.number().positive(),
    pan: z.object({ x: z.number(), y: z.number() }),
    collapsedAppearanceIds: z.array(z.string()),
    expandedRelativeIds: z.array(z.string()).optional(),
    showAllRelatives: z.boolean().optional(),
    compactCards: z.boolean().optional(),
    expandedSiblingIds: z.array(z.string()).optional(),
    collapsedAncestorIds: z.array(z.string()).optional(),
  }),
})
const snapshot = z.object({
  version: z.literal(1),
  state: z.object({
    homePersonId: z.string(), initialGenerations: z.number().int().positive(), initialMapZoom: z.number().positive(),
    key: z.string(), current: view, entries: z.record(z.string(), view),
    trail: z.array(z.string()).min(1), position: z.number().int().nonnegative(),
  }),
})

/** Only IDs and view settings are stored, separately for each browser tab. */
export function saveViewSession(state: ViewState) {
  try {
    sessionStorage.setItem(viewSessionKey, JSON.stringify({ version: 1, state }))
  } catch { /* Denied storage or a full quota must not interrupt the diagram. */ }
}

export function restoreViewSession(fallback: ViewState, personIds: ReadonlySet<string>): ViewState {
  try {
    const result = snapshot.safeParse(JSON.parse(sessionStorage.getItem(viewSessionKey) ?? 'null'))
    if (!result.success) return fallback
    const saved = result.data.state
    if (saved.homePersonId !== fallback.homePersonId || saved.initialGenerations !== fallback.initialGenerations
      || saved.initialMapZoom !== fallback.initialMapZoom || saved.trail[saved.position] !== saved.key
      || new Set(saved.trail).size !== saved.trail.length) return fallback
    const views = { ...saved.entries, [saved.key]: saved.current }
    if (saved.trail.some(key => !Object.hasOwn(views, key))) return fallback
    const target = views[fallback.key]
    // The URL and browser history entry remain authoritative, including direct links.
    if (!saved.trail.includes(fallback.key) || !target || target.screen !== fallback.current.screen
      || target.personId !== fallback.current.personId) return fallback
    if (Object.values(views).some(entry => !personIds.has(entry.centerPersonId)
      || entry.personId !== null && !personIds.has(entry.personId)
      || entry.screen !== 'person' && entry.screen !== 'missing'
        && (entry.screen !== entry.mapScreen || entry.centerPersonId !== entry.personId))) return fallback
    return viewReducer(saved, { type: 'visit', key: fallback.key, route: fallback.current, navigationType: 'POP' })
  } catch { return fallback }
}
