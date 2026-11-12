export type MapScreen = 'tree' | 'horizontal' | 'vertical' | 'vertical-design' | 'vertical-minimal' | 'relatives'
export const portraitMapBaseZoom = 0.3
export type ViewRoute = { screen: MapScreen | 'person' | 'photos' | 'missing'; personId: string | null }
export type MapSettings = {
  generations: number
  zoom: number
  /** Fractions of the viewport width (x) and height (y), independent of pixel dimensions. */
  pan: { x: number; y: number }
  collapsedAppearanceIds: string[]
  compactCards?: boolean
  expandedSiblingIds?: string[]
  collapsedSiblingIds?: string[]
  collapsedAncestorIds?: string[]
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
  initialMapZoom: number
  key: string
  current: View
  entries: Record<string, View>
  diagramMaps: Record<string, MapSettings>
  trail: string[]
  position: number
}
export type ViewAction =
  | { type: 'visit'; key: string; route: ViewRoute; navigationType: 'POP' | 'PUSH' | 'REPLACE'; resetMap?: boolean }
  | { type: 'reset-map' }
  | { type: 'map'; settings: Partial<MapSettings> }
  | { type: 'relationship'; id: string | null }

function defaultMap(generations: number, zoom = 1): MapSettings {
  return { generations, zoom, pan: { x: (1 - zoom) / 2, y: (1 - zoom) / 2 }, collapsedAppearanceIds: [] }
}

function isMapScreen(screen: ViewRoute['screen']): screen is MapScreen {
  return screen === 'tree' || screen === 'horizontal' || screen === 'vertical' || screen === 'vertical-design' || screen === 'vertical-minimal' || screen === 'relatives'
}

function defaultMapZoom(screen: MapScreen, initialMapZoom: number) {
  return screen === 'vertical-design' || screen === 'vertical-minimal' || screen === 'relatives' ? portraitMapBaseZoom : initialMapZoom
}

function diagramKey(screen: MapScreen, centerPersonId: string) {
  return `${screen}/${centerPersonId}`
}

export function initialView(homePersonId: string, initialGenerations: number, key: string, route: ViewRoute, initialMapZoom = 1): ViewState {
  const mapScreen = isMapScreen(route.screen) ? route.screen : 'tree'
  return {
    homePersonId, initialGenerations, initialMapZoom, key, entries: {}, diagramMaps: {}, trail: [key], position: 0,
    current: { ...route, mapScreen,
      centerPersonId: route.personId ?? homePersonId, selectedRelationshipId: null,
      map: defaultMap(initialGenerations, defaultMapZoom(mapScreen, initialMapZoom)) },
  }
}

export function viewReducer(state: ViewState, action: ViewAction): ViewState {
  if (action.type === 'reset-map') return { ...state, current: { ...state.current,
    selectedRelationshipId: null, map: defaultMap(state.initialGenerations, defaultMapZoom(state.current.mapScreen, state.initialMapZoom)) } }
  if (action.type === 'map') return { ...state, current: { ...state.current, map: { ...state.current.map, ...action.settings } } }
  if (action.type === 'relationship') return { ...state, current: { ...state.current, selectedRelationshipId: action.id } }
  const entries = { ...state.entries, [state.key]: state.current }
  // Rooms carry the last map as context, but only a displayed diagram updates its saved settings.
  const diagramMaps = isMapScreen(state.current.screen) ? {
    ...state.diagramMaps,
    [diagramKey(state.current.screen, state.current.centerPersonId)]: state.current.map,
  } : state.diagramMaps
  const restored = action.navigationType === 'POP' ? entries[action.key] : undefined
  const centerPersonId = isMapScreen(action.route.screen) && action.route.personId
    ? action.route.personId : state.current.centerPersonId
  const mapScreen = isMapScreen(action.route.screen) ? action.route.screen : state.current.mapScreen
  const zoom = defaultMapZoom(mapScreen, state.initialMapZoom)
  const savedMap = action.navigationType === 'PUSH' && !action.resetMap && isMapScreen(action.route.screen)
    && action.route.screen !== state.current.screen ? diagramMaps[diagramKey(mapScreen, centerPersonId)] : undefined
  const map = !action.resetMap && centerPersonId === state.current.centerPersonId ? state.current.map
    : { ...defaultMap(state.initialGenerations, zoom), compactCards: state.current.map.compactCards }
  const current = restored ?? {
    ...action.route, mapScreen, centerPersonId, selectedRelationshipId: null,
    map: savedMap ?? (mapScreen === state.current.mapScreen ? map : {
      ...defaultMap(map.generations, zoom), collapsedAppearanceIds: map.collapsedAppearanceIds }),
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
  return { ...state, key: action.key, current, entries, diagramMaps, trail, position }
}
