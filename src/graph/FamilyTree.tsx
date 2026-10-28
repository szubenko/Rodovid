import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { personName } from '../data/person-name'
import { confidenceLabels } from '../data/schema'
import { useFamily, useView } from '../navigation/context'
import { EvidenceForTarget } from '../room/Evidence'
import { availableGenerations, buildFamilyGraph, directLinePersonIds, projectFamily } from './projection'
import { layoutTree, type TreeOrientation } from './tree-layout'
import { availableRelativeGenerations, projectRelatives } from './relatives-projection'
import { layoutRelatives } from './relatives-layout'
import { projectVerticalFamily } from './vertical-projection'
import { lifeYears, relationshipName } from './presentation'
import { useMapCamera } from './useMapCamera'
import { useMapViewport } from './useMapViewport'
import { useMapExpansion } from './useMapExpansion'
import { fitCamera, maxZoom, minZoom, scaleCamera } from './camera'
import { closestRelationship } from './closest-relationship'
import { downloadSvgAsPng } from './export-png'
import shared from './RadialMap.module.css'
import styles from './FamilyTree.module.css'
import { PersonTooltip } from './PersonTooltip'
import { PersonCardArtwork, SkinnedPersonCard } from './SkinnedPersonCard'
import { personCardSkin } from './person-card-skin'

function activate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action() }
}

export function FamilyTree({ personId, orientation, includeRelatives = false }: {
  personId: string; orientation: TreeOrientation; includeRelatives?: boolean
}) {
  const title = includeRelatives ? 'Родовід з усіма родичами' : orientation === 'vertical' ? 'Вертикальний родовід' : 'Горизонтальний родовід'
  const vertical = orientation === 'vertical'
  const mapScreen = includeRelatives ? 'relatives' : orientation
  const family = useFamily()
  const { state, dispatch, goTo, goBack } = useView()
  const container = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const { width, height } = useMapViewport(container)
  const { expanded, toggleExpansion } = useMapExpansion(container)
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'saved' | 'error'>('idle')
  const prefix = useId()
  const graph = useMemo(() => buildFamilyGraph(family), [family])
  const directLine = useMemo(() => directLinePersonIds(graph, state.homePersonId), [graph, state.homePersonId])
  const labels = useMemo(() => new Map(family.people.map(person => [person.id, personName(family, person.id)])), [family])
  const dates = useMemo(() => new Map(family.people.map(person => {
    const years = lifeYears(family, person.id)
    return [person.id, years === 'Роки життя невідомі' ? '' : years]
  })), [family])
  const skins = useMemo(() => new Map(family.people.map(person => [person.id, personCardSkin(family, person.id)])), [family])
  const measureCardName = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d')
    if (context) context.font = '700 24px Georgia, "Times New Roman", serif'
    return (text: string) => (context?.measureText(text).width ?? Array.from(text).length * 16) * 1.03
  }, [])
  const measure = useMemo(() => {
    const contexts = new Map<number, CanvasRenderingContext2D | null>()
    for (const size of [18, 20, 22]) {
      const context = document.createElement('canvas').getContext('2d')
      if (context) context.font = `${size === 22 ? '600 ' : ''}${size}px system-ui, sans-serif`
      contexts.set(size, context)
    }
    return (text: string, size: number) => {
      return (contexts.get(size)?.measureText(text).width ?? Array.from(text).length * size) * 1.03
    }
  }, [])
  const settings = state.current.map
  const maxGenerations = useMemo(() => includeRelatives ? availableRelativeGenerations(graph, personId)
    : availableGenerations(graph, personId), [graph, personId, includeRelatives])
  const generations = Math.min(settings.generations, maxGenerations)
  const projection = useMemo(() => includeRelatives ? projectRelatives(graph, personId, {
    generations, expandedPersonIds: settings.expandedRelativeIds, showAll: settings.showAllRelatives,
  }) : (vertical ? projectVerticalFamily(graph, personId, directLine, {
    generations: Math.min(12, generations + 1), collapsedAppearanceIds: settings.collapsedAppearanceIds,
  }) : projectFamily(graph, personId, { generations: Math.min(12, generations + 1),
    collapsedAppearanceIds: settings.collapsedAppearanceIds })), [graph, personId, generations, includeRelatives, vertical, directLine,
    settings.collapsedAppearanceIds, settings.expandedRelativeIds, settings.showAllRelatives])
  const layout = useMemo(() => 'relatedCount' in projection ? layoutRelatives(projection, graph, labels, dates, measure)
    : 'familyMode' in projection ? layoutRelatives(projection, graph, labels, dates, measure, directLine)
    : layoutTree(projection, labels, dates, measure, orientation, directLine), [projection, graph, labels, dates, measure, orientation, directLine])
  const center = layout.nodes.find(node => node.lane === 'center')!
  const offset = { x: width / 2 - center.x, y: height / 2 - center.y }
  useMapCamera(container, width, settings, dispatch, height)
  const relations = [...new Set(projection.edges.map(edge => edge.relationshipId))].map(id => graph.relationships.get(id)!)
  const selected = relations.find(relation => relation.id === state.current.selectedRelationshipId)
  const changeScale = (factor: number) => dispatch({ type: 'map', settings: scaleCamera(settings, factor) })
  const toggleAllRelatives = () => {
    if (settings.showAllRelatives) {
      dispatch({ type: 'map', settings: { showAllRelatives: false, expandedRelativeIds: [],
        ...scaleCamera({ zoom: 1, pan: { x: 0, y: 0 } }, state.initialMapZoom) } })
      return
    }
    const full = layoutRelatives(projectRelatives(graph, personId, { generations, showAll: true }), graph, labels, dates, measure)
    const root = full.nodes.find(node => node.lane === 'center')!
    dispatch({ type: 'map', settings: { showAllRelatives: true, ...fitCamera({
      x: width / 2 - root.x, y: height / 2 - root.y, width: full.width, height: full.height,
    }, width, height) } })
  }
  const toggleBranch = (id: string) => {
    const expanded = settings.expandedRelativeIds ?? []
    dispatch({ type: 'map', settings: { expandedRelativeIds: expanded.includes(id)
      ? expanded.filter(person => person !== id) : [...expanded, id] } })
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
    data-map-expanded={expanded} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined}>
    <div className={shared.controls} role="group" aria-label="Керування картою">
      <button aria-label="Назад до попереднього перегляду" disabled={state.position === 0} onClick={goBack}>← Назад</button>
      <button aria-label="Зменшити масштаб" disabled={settings.zoom <= minZoom} onClick={() => changeScale(1 / 1.25)}>−</button>
      <output aria-label="Масштаб карти">{Math.round(settings.zoom * 100)}%</output>
      <button aria-label="Збільшити масштаб" disabled={settings.zoom >= maxZoom} onClick={() => changeScale(1.25)}>+</button>
      <button onClick={() => dispatch({ type: 'map', settings: fitCamera({ x: offset.x, y: offset.y,
        width: layout.width, height: layout.height }, width, height) })}>Вмістити карту</button>
      <button onClick={() => dispatch({ type: 'map', settings: { zoom: 1, pan: { x: 0, y: 0 } } })}>До центру</button>
      <button onClick={toggleExpansion} aria-pressed={expanded}>{expanded ? 'Згорнути діаграму' : 'На весь екран'}</button>
      <button onClick={() => { void savePng() }} disabled={exportState === 'exporting'}>{exportState === 'exporting' ? 'Готуємо PNG…' : 'Зберегти PNG'}</button>
      <label htmlFor={`${prefix}-generations`}>Покоління</label>
      <select id={`${prefix}-generations`} value={generations} onChange={event => dispatch({ type: 'map', settings: {
        generations: Number(event.target.value), ...(includeRelatives ? { showAllRelatives: false, expandedRelativeIds: [] } : {}),
      } })}>
        {Array.from({ length: maxGenerations }, (_, index) => index + 1).map(depth => <option key={depth} value={depth}>{depth}</option>)}
      </select>
      {includeRelatives && <button aria-pressed={settings.showAllRelatives === true} onClick={toggleAllRelatives}>
        {settings.showAllRelatives ? 'Початкові гілки' : 'Показати всіх родичів'}
      </button>}
    </div>
    {exportState !== 'idle' && <p className={shared.exportStatus} role="status">{exportState === 'exporting' ? 'Створюємо PNG високої якості…'
      : exportState === 'saved' ? 'PNG збережено у файл.' : 'Не вдалося створити PNG. Спробуйте ще раз.'}</p>}
    <div ref={container} className={styles.canvas} data-map-viewport>
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${title}: ${labels.get(personId)}`}>
        <defs><PersonCardArtwork id={`${prefix}-skin-artwork`} /></defs>
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
              const branchExpanded = settings.expandedRelativeIds?.includes(node.personId) === true
              const branchAction = () => toggleBranch(node.personId)
              const hiddenCount = new Set(node.hiddenConnections.map(connection => connection.personId)).size
              const skin = skins.get(node.personId)!
              return <g key={node.appearanceId}>
                <g className={styles.node} data-person-id={node.personId}
                data-card-skin={skin.id}
                data-appearance-id={node.appearanceId} data-center={central} data-lane={node.lane}
                data-generation={node.generation}
                data-direct-line={vertical && !includeRelatives ? directLine.has(node.personId) : undefined}
                data-main-line={includeRelatives ? node.lane !== 'relatives' : undefined}
                data-parent-appearance-id={node.parentAppearanceId ?? undefined}
                role="link" tabIndex={0} onClick={event => { if (event.detail < 2) action() }} onKeyDown={event => activate(event, action)}
                aria-label={`${central ? 'У центрі. Відкрити кімнату' : 'Показати в центрі'}: ${labels.get(node.personId)}. ${dates.get(node.personId)}${hidden ? '. Є родичі поза цим показом' : ''}`}>
                <SkinnedPersonCard x={node.x} y={node.y} width={node.width} height={node.height}
                  name={labels.get(node.personId)!} years={dates.get(node.personId) ?? ''} skin={skin} cardClassName={styles.card}
                  artworkId={`${prefix}-skin-artwork`} measureName={measureCardName} measureYears={text => measure(text, 18) * 15 / 18} />
                {hidden && !includeRelatives && <text className={styles.marker} x={node.x + node.width / 2 - 10} y={node.y - node.height / 2 + 16} textAnchor="end">↗</text>}
                </g>
                {includeRelatives && !settings.showAllRelatives && (hidden || branchExpanded) && <g className={styles.branch}
                  data-branch-person-id={node.personId} role="button" tabIndex={0} aria-expanded={branchExpanded}
                  aria-label={`${branchExpanded ? 'Згорнути' : 'Додати'} гілку: ${labels.get(node.personId)}${hiddenCount ? `. Прихованих родичів: ${hiddenCount}` : ''}`}
                  onClick={event => { event.stopPropagation(); branchAction() }} onKeyDown={event => activate(event, branchAction)}>
                  <title>{branchExpanded ? 'Згорнути додану гілку' : `Додати родичів: ${hiddenCount}`}</title>
                  <rect className={styles.branchHit} data-hit="true" x={node.x + node.width / 2 - 52} y={node.y + node.height / 2 + 6} width="44" height="44" />
                  <rect x={node.x + node.width / 2 - 52} y={node.y + node.height / 2 + 6} width="44" height="44" rx="22" />
                  <text x={node.x + node.width / 2 - 30} y={node.y + node.height / 2 + 28} textAnchor="middle" dominantBaseline="central">{branchExpanded ? '−' : '+'}</text>
                </g>}
              </g>
            })}
          </g></g>
        </g>
      </svg>
    </div>
    <PersonTooltip key={`${personId}/${settings.zoom}/${settings.pan.x}/${settings.pan.y}/${generations}/${expanded}/${settings.showAllRelatives}/${settings.expandedRelativeIds?.join(',')}`} container={container} />
    {'relatedCount' in projection && <p className={styles.count} role="status" data-testid="relatives-count">
      Людей у схемі: {projection.appearances.length} із {projection.relatedCount}.
    </p>}
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
