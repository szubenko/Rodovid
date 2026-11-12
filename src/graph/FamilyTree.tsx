import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { personName } from '../data/person-name'
import { confidenceLabels } from '../data/schema'
import { useFamily, useView } from '../navigation/context'
import { portraitMapBaseZoom } from '../navigation/view-state'
import { EvidenceForTarget } from '../room/Evidence'
import { availableGenerations, buildFamilyGraph, directLinePersonIds, projectFamily } from './projection'
import { layoutTree, type TreeOrientation } from './tree-layout'
import { layoutRelatives } from './relatives-layout'
import { ancestorPersonIds, availableVerticalGenerations, projectVerticalFamily, siblingPersonIds } from './vertical-projection'
import { lifeYears, relationshipName } from './presentation'
import { useMapCamera } from './useMapCamera'
import { useMapViewport } from './useMapViewport'
import { useMapExpansion } from './useMapExpansion'
import { fitCamera, formatCameraZoom, maxZoom, minZoom, scaleCamera } from './camera'
import { closestRelationship } from './closest-relationship'
import { downloadSvgAsPng } from './export-png'
import shared from './RadialMap.module.css'
import styles from './FamilyTree.module.css'
import { PersonTooltip } from './PersonTooltip'
import { PersonCardArtwork, SkinnedPersonCard } from './SkinnedPersonCard'
import { personCardSkin } from './person-card-skin'
import { PortraitCardDefinitions, PortraitPersonCard } from './PortraitPersonCard'
import { portraitCardMetrics, portraitLayoutOptions } from './portrait-card-layout'

function createNameMeasure() {
  const context = document.createElement('canvas').getContext('2d')
  if (context) context.font = '700 24px Georgia, "Times New Roman", serif'
  const widths = new Map<string, number>()
  return (text: string) => {
    let width = widths.get(text)
    if (width === undefined) {
      width = (context?.measureText(text).width ?? Array.from(text).length * 16) * 1.03
      widths.set(text, width)
    }
    return width
  }
}

function createTextMeasure() {
  const contexts = new Map<number, CanvasRenderingContext2D | null>()
  for (const size of [18, 20, 22]) {
    const context = document.createElement('canvas').getContext('2d')
    if (context) context.font = `${size === 22 ? '600 ' : ''}${size}px system-ui, sans-serif`
    contexts.set(size, context)
  }
  const widths = new Map<string, number>()
  return (text: string, size: number) => {
    const key = `${size}/${text}`
    let width = widths.get(key)
    if (width === undefined) {
      width = (contexts.get(size)?.measureText(text).width ?? Array.from(text).length * size) * 1.03
      widths.set(key, width)
    }
    return width
  }
}

function createRelativeLayout(graph: Parameters<typeof layoutRelatives>[1], labels: Map<string, string>, dates: Map<string, string>, measure: Parameters<typeof layoutRelatives>[4]) {
  const cache = new Map<string, ReturnType<typeof layoutRelatives>>()
  return (next: Parameters<typeof layoutRelatives>[0], line: ReadonlySet<string>, options: Parameters<typeof layoutRelatives>[6]) => {
    const key = JSON.stringify([next, [...line], options])
    let result = cache.get(key)
    if (!result) {
      result = layoutRelatives(next, graph, labels, dates, measure, line, options)
      if (cache.size >= 8) cache.delete(cache.keys().next().value!)
      cache.set(key, result)
    }
    return result
  }
}

function activate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action() }
}

export function FamilyTree({ personId, orientation, includeRelatives = false, portraitCards = false, portraitVariant = 'design' }: {
  personId: string; orientation: TreeOrientation; includeRelatives?: boolean; portraitCards?: boolean; portraitVariant?: 'design' | 'minimal'
}) {
  const minimalCards = portraitCards && portraitVariant === 'minimal'
  const title = includeRelatives ? 'Усі Родичі New' : portraitCards ? portraitVariant === 'minimal' ? 'Вертикальна мінімальна' : 'Вертикальний родовід · новий дизайн' : orientation === 'vertical' ? 'Вертикальний родовід' : 'Горизонтальний родовід'
  const vertical = orientation === 'vertical'
  const mapScreen = includeRelatives ? 'relatives' : portraitCards ? portraitVariant === 'minimal' ? 'vertical-minimal' : 'vertical-design' : orientation
  const family = useFamily()
  const { state, dispatch, goTo, goBack } = useView()
  const container = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const { width, height } = useMapViewport(container)
  const { expanded, toggleExpansion } = useMapExpansion(container)
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'saved' | 'error'>('idle')
  const prefix = useId()
  const graph = useMemo(() => buildFamilyGraph(family), [family])
  const siblings = useMemo(() => new Map(family.people.map(person => [person.id, siblingPersonIds(graph, person.id)])), [family, graph])
  const homeLine = useMemo(() => directLinePersonIds(graph, state.homePersonId), [graph, state.homePersonId])
  const portraitMainLine = useMemo(() => portraitCards ? ancestorPersonIds(graph, personId) : undefined, [graph, personId, portraitCards])
  const labels = useMemo(() => new Map(family.people.map(person => [person.id, personName(family, person.id)])), [family])
  const dates = useMemo(() => new Map(family.people.map(person => {
    const years = lifeYears(family, person.id)
    return [person.id, years === 'Роки життя невідомі' ? '' : years]
  })), [family])
  const skins = useMemo(() => new Map(family.people.map(person => [person.id, personCardSkin(family, person.id)])), [family])
  const portraits = useMemo(() => new Map(family.people.map(person => [person.id,
    family.media.find(media => media.id === person.portraitId && media.mimeType.startsWith('image/'))?.path])), [family])
  const measureCardName = useMemo(() => createNameMeasure(), [])
  const measure = useMemo(() => createTextMeasure(), [])
  const measureYears = useMemo(() => (text: string) => measure(text, 18) * 15 / 18, [measure])
  const measureRole = useMemo(() => (text: string) => measure(text, 22) * 13 / 22, [measure])
  const settings = state.current.map
  const expandedSiblingIds = useMemo(() => includeRelatives
    ? [...graph.personIds].filter(id => !settings.collapsedSiblingIds?.includes(id))
    : settings.expandedSiblingIds, [includeRelatives, graph, settings.collapsedSiblingIds, settings.expandedSiblingIds])
  const compact = settings.compactCards === true
  const portraitMetrics = useMemo(() => portraitCardMetrics(labels.values(), dates.values(), compact,
    measureCardName, text => measure(text, 18) * 15 / 18, !minimalCards, Array.from(skins.values(), skin => skin.label)),
  [labels, dates, compact, measureCardName, measure, minimalCards, skins])
  const portraitLayout = useMemo(() => portraitCards ? portraitLayoutOptions(portraitMetrics, compact)
    : undefined, [portraitCards, portraitMetrics, compact])
  const maxGenerations = useMemo(() => includeRelatives ? 1
    : vertical ? availableVerticalGenerations(graph, personId) : availableGenerations(graph, personId), [graph, personId, includeRelatives, vertical])
  const generations = Math.min(settings.generations, maxGenerations)
  const projection = useMemo(() => vertical ? projectVerticalFamily(graph, personId, {
    generations: includeRelatives ? 12 : Math.min(12, generations + 1),
    collapsedAppearanceIds: includeRelatives ? undefined : settings.collapsedAppearanceIds,
    expandedSiblingPersonIds: portraitCards ? expandedSiblingIds : undefined,
    collapsedAncestorPersonIds: portraitCards ? settings.collapsedAncestorIds : undefined,
  }) : projectFamily(graph, personId, { generations: Math.min(12, generations + 1),
    collapsedAppearanceIds: settings.collapsedAppearanceIds }), [graph, personId, generations, includeRelatives, vertical,
    settings.collapsedAppearanceIds, expandedSiblingIds, settings.collapsedAncestorIds, portraitCards])
  const directLine = useMemo(() => vertical
    ? portraitMainLine ?? new Set(projection.appearances.map(node => node.personId)) : homeLine,
  [projection, vertical, homeLine, portraitMainLine])
  // Branch anchoring asks for the next layout before dispatch. Reuse it when React
  // renders that projection, and when the same branch is opened again.
  const relativeLayout = useMemo(() => createRelativeLayout(graph, labels, dates, measure), [graph, labels, dates, measure])
  const layout = useMemo(() => 'siblingGroups' in projection ? relativeLayout(projection, directLine, portraitLayout)
    : layoutTree(projection, labels, dates, measure, orientation, directLine), [projection, relativeLayout, labels, dates, measure, orientation, directLine, portraitLayout])
  const shownIds = useMemo(() => new Set(layout.nodes.map(node => node.personId)), [layout])
  const visibleSkins = useMemo(() => layout.nodes.map(node => skins.get(node.personId)!), [layout, skins])
  const siblingBranchOwners = useMemo(() => new Set('siblingGroups' in projection
    ? projection.siblingGroups.map(group => group.personId) : []), [projection])
  const center = layout.nodes.find(node => node.lane === 'center')!
  const offset = { x: width / 2 - center.x, y: height / 2 - center.y }
  const zoomReference = portraitCards ? portraitMapBaseZoom : state.initialMapZoom
  useMapCamera(container, width, settings, dispatch, height, zoomReference)
  const relations = [...new Set(projection.edges.map(edge => edge.relationshipId))].map(id => graph.relationships.get(id)!)
  const selected = relations.find(relation => relation.id === state.current.selectedRelationshipId)
  const changeScale = (factor: number) => dispatch({ type: 'map', settings: scaleCamera(settings, factor) })
  const changeBranches = (id: string, changes: { expandedSiblingIds?: string[]; collapsedSiblingIds?: string[]; collapsedAncestorIds?: string[] }) => {
    const collapsedAncestors = changes.collapsedAncestorIds ?? settings.collapsedAncestorIds
    const nextExpandedSiblings = includeRelatives
      ? [...graph.personIds].filter(person => !(changes.collapsedSiblingIds ?? settings.collapsedSiblingIds)?.includes(person))
      : changes.expandedSiblingIds ?? expandedSiblingIds
    const nextProjection = projectVerticalFamily(graph, personId, {
      generations: includeRelatives ? 12 : Math.min(12, generations + 1),
      collapsedAppearanceIds: includeRelatives ? undefined : settings.collapsedAppearanceIds,
      expandedSiblingPersonIds: nextExpandedSiblings,
      collapsedAncestorPersonIds: collapsedAncestors,
    })
    const nextLayout = relativeLayout(nextProjection, directLine, portraitLayout)
    const before = layout.nodes.find(node => node.personId === id)!
    const after = nextLayout.nodes.find(node => node.personId === id)!
    const nextCenter = nextLayout.nodes.find(node => node.lane === 'center')!
    dispatch({ type: 'map', settings: { ...changes, pan: {
      x: settings.pan.x + (before.x - center.x - after.x + nextCenter.x) * settings.zoom / width,
      y: settings.pan.y + (before.y - center.y - after.y + nextCenter.y) * settings.zoom / height,
    } } })
  }
  const toggleSiblings = (id: string) => {
    const field = includeRelatives ? 'collapsedSiblingIds' : 'expandedSiblingIds'
    const toggled = settings[field] ?? []
    changeBranches(id, { [field]: toggled.includes(id) ? toggled.filter(person => person !== id) : [...toggled, id] })
  }
  const toggleAncestors = (id: string) => {
    const collapsed = settings.collapsedAncestorIds ?? []
    changeBranches(id, { collapsedAncestorIds: collapsed.includes(id) ? collapsed.filter(person => person !== id) : [...collapsed, id] })
  }
  const savePng = async () => {
    if (!svg.current) return
    setExportState('exporting')
    try {
      await downloadSvgAsPng(svg.current, `rodovid-${mapScreen}-${personId}.png`)
      setExportState('saved')
    } catch { setExportState('error') }
  }
  return <section className={shared.map} aria-label={title}
    data-card-design={minimalCards ? 'minimal' : portraitCards ? 'portrait' : 'original'} data-card-density={portraitCards ? compact ? 'compact' : 'full' : undefined}
    data-map-expanded={expanded} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined}>
    <div className={shared.controls} role="group" aria-label="Керування картою">
      <button aria-label="Назад до попереднього перегляду" disabled={state.position === 0} onClick={goBack}>← Назад</button>
      {portraitCards && <button aria-pressed={compact} onClick={() => dispatch({ type: 'map', settings: { compactCards: !compact } })}>Компактні картки</button>}
      <button aria-label="Зменшити масштаб" disabled={settings.zoom <= minZoom} onClick={() => changeScale(1 / 1.25)}>−</button>
      <output aria-label="Масштаб карти">{formatCameraZoom(settings.zoom, zoomReference)}</output>
      <button aria-label="Збільшити масштаб" disabled={settings.zoom >= maxZoom} onClick={() => changeScale(1.25)}>+</button>
      <button onClick={() => dispatch({ type: 'map', settings: fitCamera({ x: offset.x, y: offset.y,
        width: layout.width, height: layout.height }, width, height) })}>Вмістити карту</button>
      <button onClick={() => dispatch({ type: 'map', settings: { zoom: 1, pan: { x: 0, y: 0 } } })}>До центру</button>
      <button onClick={toggleExpansion} aria-pressed={expanded}>{expanded ? 'Згорнути діаграму' : 'На весь екран'}</button>
      <button onClick={() => { void savePng() }} disabled={exportState === 'exporting'}>{exportState === 'exporting' ? 'Готуємо PNG…' : 'Зберегти PNG'}</button>
      {!includeRelatives && <><label htmlFor={`${prefix}-generations`}>Покоління</label>
      <select id={`${prefix}-generations`} value={generations} onChange={event => dispatch({ type: 'map', settings: {
        generations: Number(event.target.value),
      } })}>
        {Array.from({ length: maxGenerations }, (_, index) => index + 1).map(depth => <option key={depth} value={depth}>{depth}</option>)}
      </select></>}
    </div>
    {exportState !== 'idle' && <p className={shared.exportStatus} role="status">{exportState === 'exporting' ? 'Створюємо PNG високої якості…'
      : exportState === 'saved' ? 'PNG збережено у файл.' : 'Не вдалося створити PNG. Спробуйте ще раз.'}</p>}
    <div ref={container} className={styles.canvas} data-map-viewport>
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${title}: ${labels.get(personId)}`}>
        {!minimalCards && <defs><PersonCardArtwork id={`${prefix}-skin-artwork`} skins={visibleSkins} /></defs>}
        {portraitCards && <defs><PortraitCardDefinitions artworkId={`${prefix}-skin-artwork`} skins={visibleSkins} metrics={portraitMetrics} /></defs>}
        <g data-layer="camera" transform={`translate(${settings.pan.x * width} ${settings.pan.y * height}) scale(${settings.zoom})`}>
          <g data-layer="coordinates"><g data-layer="layout" transform={`translate(${offset.x} ${offset.y})`}>
            <g data-layer="connections">{layout.edges.map(edge => {
              const relation = graph.relationships.get(edge.relationshipId)!
              const action = () => dispatch({ type: 'relationship', id: relation.id })
              return <g key={`${edge.relationshipId}/${edge.fromAppearanceId}/${edge.toAppearanceId}`} className={styles.connection}
                data-relationship-id={relation.id} data-selected={selected?.id === relation.id}
                data-uncertain={relation.confidence !== 'confirmed' || relation.reviewStatus === 'disputed'}
                role="button" tabIndex={0} aria-pressed={selected?.id === relation.id}
                aria-label={`Зв’язок ${relations.indexOf(relation) + 1}: ${relationshipName(family, relation)}. ${confidenceLabels[relation.confidence]}`}
                onClick={event => dispatch({ type: 'relationship', id: event.detail === 0 ? relation.id
                  : closestRelationship(container.current!, event.clientX, event.clientY) ?? relation.id })}
                onKeyDown={event => activate(event, action)}>
                <title>{relationshipName(family, relation)} · {confidenceLabels[relation.confidence]}</title>
                <path className={styles.hit} data-hit="true" d={edge.path} /><path className={styles.line} d={edge.path} />
              </g>
            })}</g>
            {layout.nodes.map(node => {
              const central = node.lane === 'center'
              const hidden = node.hiddenConnections.length > 0
              const action = () => goTo(`/${central ? 'person' : mapScreen}/${node.personId}`)
              const skin = skins.get(node.personId)!
              return <g key={node.appearanceId}>
                <g className={styles.node} data-person-id={node.personId}
                data-card-skin={skin.id}
                data-appearance-id={node.appearanceId} data-center={central} data-lane={node.lane}
                data-generation={node.generation}
                data-direct-line={vertical ? directLine.has(node.personId) : undefined}
                data-parent-appearance-id={node.parentAppearanceId ?? undefined}
                role="link" tabIndex={0} onClick={event => { if (event.detail < 2) action() }} onKeyDown={event => activate(event, action)}
                aria-label={`${central ? 'У центрі. Відкрити кімнату' : 'Показати в центрі'}: ${labels.get(node.personId)}. ${dates.get(node.personId)}${hidden ? '. Є родичі поза цим показом' : ''}`}>
                {portraitCards ? <PortraitPersonCard x={node.x} y={node.y} metrics={portraitMetrics} scale={node.width / portraitMetrics.width}
                  name={labels.get(node.personId)!} years={dates.get(node.personId) ?? ''} skin={skin}
                  photoPath={portraits.get(node.personId)}
                  artworkId={`${prefix}-skin-artwork`} measureName={measureCardName} measureYears={measureYears} />
                : <SkinnedPersonCard x={node.x} y={node.y} width={node.width} height={node.height}
                  name={labels.get(node.personId)!} years={dates.get(node.personId) ?? ''} skin={skin} cardClassName={styles.card}
                  photoPath={portraits.get(node.personId)}
                  measureRole={measureRole}
                  artworkId={`${prefix}-skin-artwork`} measureName={measureCardName} measureYears={measureYears} />}
                {hidden && !portraitCards && <text className={styles.marker} x={node.x + node.width / 2 - 10} y={node.y - node.height / 2 + 16} textAnchor="end">↗</text>}
                </g>
              </g>
            })}
            {portraitCards && <g data-layer="sibling-controls">{layout.nodes.map(node => {
              const siblingIds = siblings.get(node.personId) ?? []
              const siblingsExpanded = expandedSiblingIds?.includes(node.personId) === true
              if (!siblingIds.length || !siblingBranchOwners.has(node.personId) && siblingIds.every(id => shownIds.has(id))) return null
              const action = () => toggleSiblings(node.personId)
              // Keep arrows readable at normal viewing scales; cap enlargement
              // in a very distant overview so controls do not cover whole cards.
              const controlScale = Math.min(3, 1 / settings.zoom)
              const right = graph.sexByPerson.get(node.personId) === 'F'
              return <g key={node.personId} className={styles.siblingToggle}
                transform={`translate(${node.x + (right ? 1 : -1) * (node.width / 2 + 2)} ${node.y}) scale(${controlScale})`}
                data-sibling-side={right ? 'right' : 'left'}
                data-camera-control data-sibling-person-id={node.personId} role="button" tabIndex={0} aria-expanded={siblingsExpanded}
                aria-label={`${siblingsExpanded ? 'Сховати' : 'Показати'} братів і сестер: ${labels.get(node.personId)}. ${siblingIds.length}`}
                onClick={event => { event.stopPropagation(); action() }} onKeyDown={event => activate(event, action)}>
                <title>{siblingsExpanded ? 'Сховати братів і сестер' : `Показати братів і сестер: ${siblingIds.length}`}</title>
                <rect data-hit="true" className={styles.siblingHit} x="-22" y="-22" width="44" height="44" />
                <path d={right !== siblingsExpanded ? 'M-4-8 4 0-4 8' : 'M4-8-4 0 4 8'} />
              </g>
            })}</g>}
            {portraitCards && <g data-layer="ancestor-controls">{layout.nodes.map(node => {
              if (!portraitMainLine?.has(node.personId)) return null
              const parents = graph.neighbors.get(node.personId)!.filter(neighbor => neighbor.direction === 'parents')
              const collapsed = settings.collapsedAncestorIds?.includes(node.personId) === true
              if (!parents.length || !collapsed && !parents.some(parent => shownIds.has(parent.personId))) return null
              const controlScale = Math.min(3, 1 / settings.zoom)
              const action = () => toggleAncestors(node.personId)
              return <g key={node.personId} className={styles.siblingToggle}
                transform={`translate(${node.x} ${node.y - node.height / 2 - 2}) scale(${controlScale})`}
                data-camera-control data-ancestor-person-id={node.personId} role="button" tabIndex={0} aria-expanded={!collapsed}
                aria-label={`${collapsed ? 'Розгорнути' : 'Згорнути'} предкову гілку: ${labels.get(node.personId)}`}
                onClick={event => { event.stopPropagation(); action() }} onKeyDown={event => activate(event, action)}>
                <title>{collapsed ? 'Розгорнути предкову гілку' : 'Згорнути предкову гілку'}</title>
                <rect data-hit="true" className={styles.siblingHit} x="-22" y="-22" width="44" height="44" />
                <path d={collapsed ? 'M-8 4 0-4 8 4' : 'M-8-4 0 4 8-4'} />
              </g>
            })}</g>}
          </g></g>
        </g>
      </svg>
    </div>
    <PersonTooltip key={`${personId}/${settings.zoom}/${settings.pan.x}/${settings.pan.y}/${generations}/${expanded}/${compact}/${settings.expandedSiblingIds?.join(',')}/${settings.collapsedSiblingIds?.join(',')}/${settings.collapsedAncestorIds?.join(',')}`} container={container} />
    {projection.truncated && <p role="status">Показано частину гілок. Інші люди доступні в покажчику.</p>}
    <div aria-live="polite" aria-atomic="true">{selected && <div className={shared.selection} data-testid="relationship-details" data-relationship-id={selected.id}>
      <h3>Вибраний зв’язок · {relations.indexOf(selected) + 1}</h3><p>{relationshipName(family, selected)}</p>
      <p><strong>{confidenceLabels[selected.confidence]}</strong>{selected.reviewStatus === 'disputed' ? ' · Потребує уточнення' : ''}</p>
      {selected.explanation && <p>{selected.explanation}</p>}
      <details><summary>Докази вибраного зв’язку</summary><EvidenceForTarget target={{ kind: 'relationship', id: selected.id }} /></details>
      <button onClick={() => dispatch({ type: 'relationship', id: null })}>Зняти вибір зв’язку</button>
    </div>}</div>
  </section>
}
