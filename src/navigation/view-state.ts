export type MapScreen = 'tree' | 'horizontal' | 'vertical'
export type ViewRoute = { screen: MapScreen | 'person' | 'missing'; personId: string | null }
export type MapSettings = {
  generations: number
  zoom: number
  /** Fractions of the map viewport width; independent of its current pixel width. */
  pan: { x: number; y: number }
  collapsedAppearanceIds: string[]
}
export type View = ViewRoute & {
  mapScreen: MapScreen
  centerPersonId: string
  selectedRelationshipId: string | null
  map: MapSettings
}
export type ViewState = {
  homePersonId: string
  initialGenerations: number
  key: string
  current: View
  entries: Record<string, View>
  trail: string[]
  position: number
}
export type ViewAction =
  | { type: 'visit'; key: string; route: ViewRoute; navigationType: 'POP' | 'PUSH' | 'REPLACE'; resetMap?: boolean }
  | { type: 'reset-map' }
  | { type: 'map'; settings: Partial<MapSettings> }
  | { type: 'relationship'; id: string | null }

function defaultMap(generations: number): MapSettings {
  return { generations, zoom: 1, pan: { x: 0, y: 0 }, collapsedAppearanceIds: [] }
}

function isMapScreen(screen: ViewRoute['screen']): screen is MapScreen {
  return screen === 'tree' || screen === 'horizontal' || screen === 'vertical'
}

export function initialView(homePersonId: string, initialGenerations: number, key: string, route: ViewRoute): ViewState {
  return {
    homePersonId, initialGenerations, key, entries: {}, trail: [key], position: 0,
    current: { ...route, mapScreen: isMapScreen(route.screen) ? route.screen : 'tree',
      centerPersonId: route.personId ?? homePersonId, selectedRelationshipId: null, map: defaultMap(initialGenerations) },
  }
}

export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  if (action.type === 'reset-map') return { ...state, current: { ...state.current,
    selectedRelationshipId: null, map: defaultMap(state.initialGenerations) } }
  if (action.type === 'map') return { ...state, current: { ...state.current, map: { ...state.current.map, ...action.settings } } }
  if (action.type === 'relationship') return { ...state, current: { ...state.current, selectedRelationshipId: action.id } }
  const entries = { ...state.entries, [state.key]: state.current }
  const restored = action.navigationType === 'POP' ? entries[action.key] : undefined
  const centerPersonId = isMapScreen(action.route.screen) && action.route.personId
    ? action.route.personId : state.current.centerPersonId
  const mapScreen = isMapScreen(action.route.screen) ? action.route.screen : state.current.mapScreen
  const map = !action.resetMap && centerPersonId === state.current.centerPersonId ? state.current.map : defaultMap(state.initialGenerations)
  const current = restored ?? {
    ...action.route, mapScreen, centerPersonId, selectedRelationshipId: null,
    map: mapScreen === state.current.mapScreen ? map : { ...map, zoom: 1, pan: { x: 0, y: 0 } },
  }
  let trail = state.trail
  let position = state.position
  if (action.navigationType === 'PUSH') {
    trail = [...trail.slice(0, position + 1), action.key]
    position = trail.length - 1
  } else if (action.navigationType === 'REPLACE') {
    trail = trail.map((key, index) => index === position ? action.key : key)
  } else {
    position = trail.indexOf(action.key)
    if (position < 0) { trail = [action.key]; position = 0 }
  }
  return { ...state, key: action.key, current, entries, trail, position }
}
