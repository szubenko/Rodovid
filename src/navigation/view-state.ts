export type MapScreen = 'tree' | 'horizontal' | 'vertical' | 'relatives'
export type ViewRoute = { screen: MapScreen | 'person' | 'missing'; personId: string | null }
export type MapSettings = {
  generations: number
  zoom: number
  /** Fractions of the viewport width (x) and height (y), independent of pixel dimensions. */
  pan: { x: number; y: number }
  collapsedAppearanceIds: string[]
  expandedRelativeIds?: string[]
  showAllRelatives?: boolean
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
  initialRadialZoom: number
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

function defaultMap(generations: number, screen: MapScreen = 'tree', initialRadialZoom = 1): MapSettings {
  const zoom = screen === 'tree' ? initialRadialZoom : 1
  return { generations, zoom, pan: { x: (1 - zoom) / 2, y: (1 - zoom) / 2 }, collapsedAppearanceIds: [] }
}

function isMapScreen(screen: ViewRoute['screen']): screen is MapScreen {
  return screen === 'tree' || screen === 'horizontal' || screen === 'vertical' || screen === 'relatives'
}

export function initialView(homePersonId: string, initialGenerations: number, key: string, route: ViewRoute, initialRadialZoom = 1): ViewState {
  return {
    homePersonId, initialGenerations, initialRadialZoom, key, entries: {}, trail: [key], position: 0,
    current: { ...route, mapScreen: isMapScreen(route.screen) ? route.screen : 'tree',
      centerPersonId: route.personId ?? homePersonId, selectedRelationshipId: null,
      map: defaultMap(initialGenerations, isMapScreen(route.screen) ? route.screen : 'tree', initialRadialZoom) },
  }
}

export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  if (action.type === 'reset-map') return { ...state, current: { ...state.current,
    selectedRelationshipId: null, map: defaultMap(state.initialGenerations, state.current.mapScreen, state.initialRadialZoom) } }
  if (action.type === 'map') return { ...state, current: { ...state.current, map: { ...state.current.map, ...action.settings } } }
  if (action.type === 'relationship') return { ...state, current: { ...state.current, selectedRelationshipId: action.id } }
  const entries = { ...state.entries, [state.key]: state.current }
  const restored = action.navigationType === 'POP' ? entries[action.key] : undefined
  const centerPersonId = isMapScreen(action.route.screen) && action.route.personId
    ? action.route.personId : state.current.centerPersonId
  const mapScreen = isMapScreen(action.route.screen) ? action.route.screen : state.current.mapScreen
  const map = !action.resetMap && centerPersonId === state.current.centerPersonId ? state.current.map
    : defaultMap(state.initialGenerations, mapScreen, state.initialRadialZoom)
  const current = restored ?? {
    ...action.route, mapScreen, centerPersonId, selectedRelationshipId: null,
    map: mapScreen === state.current.mapScreen ? map : {
      ...defaultMap(map.generations, mapScreen, state.initialRadialZoom), collapsedAppearanceIds: map.collapsedAppearanceIds },
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
