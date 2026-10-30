import { useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { personName } from '../data/load-family'
import { confidenceLabels } from '../data/schema'
import { useFamily, useView } from '../navigation/context'
import { availableGenerations, buildFamilyGraph, projectFamily } from './projection'
import { layoutRadial, radialPoint } from './layout'
import { connectionPath, labelArc, lifeYears, relationshipName, sectorPath } from './presentation'
import styles from './RadialMap.module.css'
import { useMapTransition } from './useMapTransition'
import { useMapCamera } from './useMapCamera'
import { useMapViewport } from './useMapViewport'
import { useMapExpansion } from './useMapExpansion'
import { fitCamera, maxZoom, minZoom, scaleCamera } from './camera'
import { EvidenceForTarget } from '../room/Evidence'
import { emptySectors } from './empty-sectors'
import { closestRelationship } from './closest-relationship'
import { downloadSvgAsPng } from './export-png'
import { birthCountries, countryColor, unknownBirthCountry } from './birth-country'
import { PersonTooltip } from './PersonTooltip'

function activate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action() }
}

export function RadialMap({ personId, fitToViewport = false }: { personId: string; fitToViewport?: boolean }) {
  const family = useFamily()
  const { state, dispatch, goTo, goBack } = useView()
  const container = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const { width, height } = useMapViewport(container)
  const { expanded, toggleExpansion } = useMapExpansion(container)
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'saved' | 'error'>('idle')
  const prefix = useId()
  const measureText = useMemo(() => {
    // Each context keeps one font; measurement never mutates a memoized object.
    const contexts = new Map<number, CanvasRenderingContext2D | null>()
    for (const size of [20]) {
      const context = document.createElement('canvas').getContext('2d')
      if (context) context.font = `${size}px system-ui, sans-serif`
      contexts.set(size, context)
    }
    return (text: string, size: number) => {
      return contexts.get(size)?.measureText(text).width ?? Array.from(text).length * size
    }
  }, [])
  const graph = useMemo(() => buildFamilyGraph(family), [family])
  const countries = useMemo(() => birthCountries(family), [family])
  const labels = useMemo(() => new Map(family.people.map((person) => [person.id, personName(family, person.id)])), [family])
  const years = useMemo(() => new Map(family.people.map((person) => [person.id, lifeYears(family, person.id)])), [family])
  const dates = useMemo(() => new Map([...years].map(([id, date]) => [id, date === 'Роки життя невідомі' ? '' : date])), [years])
  const mapSettings = state.current.map
  const { collapsedAppearanceIds, pan, zoom } = mapSettings
  const maxGenerations = useMemo(() => availableGenerations(graph, personId), [graph, personId])
  const generations = Math.min(mapSettings.generations, maxGenerations)
  const projection = useMemo(() => projectFamily(graph, personId, { generations: Math.min(12, generations + 1), collapsedAppearanceIds }), [graph, personId, generations, collapsedAppearanceIds])
  const layout = useMemo(() => layoutRadial(projection, { width, height, labels, dates, measureText,
    fontSize: 20, fitToViewport }), [projection, width, height, labels, dates, measureText, fitToViewport])
  const empty = useMemo(() => emptySectors(layout, projection.generations - 1), [layout, projection.generations])
  const renderedCamera = useMemo(() => ({ ...mapSettings, pan: { x: pan.x * width, y: pan.y * height } }), [mapSettings, pan.x, pan.y, width, height])
  useMapCamera(container, width, mapSettings, dispatch, height)
  useMapTransition(container, layout, personId, renderedCamera)
  const nodes = new Map(layout.nodes.map((node) => [node.appearanceId, node]))
  const visibleCountries = [...new Set(layout.nodes.map(node => countries.get(node.personId)!))]
    .sort((a, b) => Number(a === unknownBirthCountry) - Number(b === unknownBirthCountry) || a.localeCompare(b, 'uk'))
  const relations = [...new Set(layout.edges.map((edge) => edge.relationshipId))].map((id) => graph.relationships.get(id)!)
  const selected = relations.find((relation) => relation.id === state.current.selectedRelationshipId)
  const selectRelation = (id: string) => dispatch({ type: 'relationship', id })
  const changeScale = (factor: number) => dispatch({ type: 'map', settings: scaleCamera(mapSettings, factor) })
  const fitMap = () => {
    const drawing = svg.current?.querySelector<SVGGElement>('[data-layer="coordinates"]')
    if (drawing) dispatch({ type: 'map', settings: fitCamera(drawing.getBBox(), width, height) })
  }
  const savePng = async () => {
    if (!svg.current) return
    setExportState('exporting')
    try {
      await downloadSvgAsPng(svg.current, `rodovid-${personId}.png`, 3 / layout.textScale)
      setExportState('saved')
    } catch {
      setExportState('error')
    }
  }

  return <section className={`${styles.map} ${styles.withCountryLegend}`} aria-label="Радіальна карта родини"
    data-map-expanded={expanded} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined}>
    <div className={styles.controls} role="group" aria-label="Керування картою">
      <button aria-label="Назад до попереднього перегляду" disabled={state.position === 0} onClick={goBack}>← Назад</button>
      <button aria-label="Зменшити масштаб" disabled={zoom <= minZoom} onClick={() => changeScale(1 / 1.25)}>−</button>
      <output aria-label="Масштаб карти">{Math.round(zoom * 100)}%</output>
      <button aria-label="Збільшити масштаб" disabled={zoom >= maxZoom} onClick={() => changeScale(1.25)}>+</button>
      <button onClick={fitMap}>Вмістити карту</button>
      <button onClick={() => dispatch({ type: 'map', settings: { zoom: 1, pan: { x: 0, y: 0 } } })}>До центру</button>
      <button onClick={toggleExpansion} aria-pressed={expanded}>{expanded ? 'Згорнути діаграму' : 'На весь екран'}</button>
      <button onClick={() => { void savePng() }} disabled={exportState === 'exporting'}
        title="Зберегти всю поточну діаграму, включно з частинами за межами екрана">
        {exportState === 'exporting' ? 'Готуємо PNG…' : 'Зберегти PNG'}
      </button>
      <label htmlFor={`${prefix}-generations`}>Покоління</label>
      <select id={`${prefix}-generations`} value={generations} onChange={(event) => dispatch({ type: 'map', settings: { generations: Number(event.target.value) } })}>
        {Array.from({ length: maxGenerations }, (_, index) => index + 1).map((depth) => <option key={depth} value={depth}>{depth}</option>)}
      </select>
    </div>
    {exportState !== 'idle' && <p className={styles.exportStatus} role="status">
      {exportState === 'exporting' && 'Створюємо PNG високої якості…'}
      {exportState === 'saved' && 'PNG збережено у файл.'}
      {exportState === 'error' && 'Не вдалося створити PNG. Спробуйте ще раз.'}
    </p>}
    <div className={styles.countryLegend} role="group" aria-label="Країна народження">
      <span>Країна народження · як записано в родоводі:</span>
      {visibleCountries.map(country => <span key={country} className={styles.countryKey}>
        <i aria-hidden="true" style={{ backgroundColor: countryColor(country) }} />{country}
      </span>)}
    </div>
    <div ref={container} className={styles.canvas} data-map-viewport>
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`Родина: ${labels.get(personId)}`}>
        <g data-layer="camera" transform={`translate(${renderedCamera.pan.x} ${renderedCamera.pan.y}) scale(${zoom})`}>
          <g data-layer="coordinates">
            <g data-layer="empty-sectors" aria-hidden="true">
              {empty.map((sector, index) => {
                return <g key={index} className={styles.empty} data-lane={sector.lane} data-tone={sector.tone} data-branch={sector.startAngle < 0 ? 'left' : 'right'}>
                  <path className={styles.sector} d={sectorPath(sector, layout.center)} />
                  <path className={styles.rim} d={labelArc({ ...sector, reverseLabel: false }, layout.center, sector.outerRadius)} />
                </g>
              })}
            </g>
            {[...layout.nodes].sort((a, b) => Number(a.lane === 'center') - Number(b.lane === 'center')).map((node, index) => {
              const central = node.lane === 'center'
              const country = countries.get(node.personId)!
              const date = years.get(node.personId)!
              const nameId = `${prefix}-name-${index}`
              const hidden = node.hiddenConnections.some((connection) => connection.reason !== 'recenter')
              const radial = node.labelOrientation === 'radial'
              const angle = (node.startAngle + node.endAngle) / 2
              let rotation = ((angle + 270) % 360 + 360) % 360
              if (rotation > 90 && rotation <= 270) rotation -= 180
              if (rotation > 270) rotation -= 360
              const textPosition = radialPoint(layout.center, node.labelRadius, angle)
              const action = () => goTo(`/${central ? 'person' : 'tree'}/${node.personId}`)
              return <g key={node.appearanceId} className={styles.node} data-person-id={node.personId}
                data-birth-country={country} style={{ '--birth-country-color': countryColor(country) } as CSSProperties}
                data-appearance-id={node.appearanceId} data-center={central} data-lane={node.lane} data-ring={node.ring} data-tone={node.tone} data-branch={node.startAngle < 0 ? 'left' : 'right'}
                role="link" tabIndex={0} onClick={(event) => { if (event.detail < 2) action() }} onKeyDown={(event) => activate(event, action)}
                aria-label={`${central ? 'У центрі. Відкрити кімнату' : 'Показати в центрі'}: ${node.fullLabel}. ${date}. Країна народження: ${country}${hidden ? '. Є родичі поза цим показом' : ''}`}>
                {central ? <circle className={styles.sector} cx={node.x} cy={node.y} r={layout.centerRadius} />
                  : <><path className={styles.sector} d={sectorPath(node, layout.center)} />
                    <path className={styles.rim} d={labelArc({ ...node, reverseLabel: false }, layout.center, node.outerRadius)} /></>}
                {central ? <>
                  {node.text.lines.map((line, lineIndex) => <text key={lineIndex} className={line.date ? styles.date : styles.label}
                    data-label-kind={line.date ? 'date' : 'name'} data-label-width={node.text.width}
                    fontSize={line.fontSize} x={node.x} y={node.y + line.y}
                    textAnchor="middle" dominantBaseline="central">{line.text}</text>)}
                </> : radial ? <g data-label-orientation="radial"
                  transform={`translate(${textPosition.x} ${textPosition.y}) rotate(${rotation})`}>
                  {node.text.lines.map((line, lineIndex) => <text key={lineIndex} className={line.date ? styles.date : styles.label}
                    data-label-kind={line.date ? 'date' : 'name'} data-label-width={node.text.width}
                    fontSize={line.fontSize} x={line.x ?? 0} y={line.y} textAnchor="middle" dominantBaseline="central">{line.text}</text>)}
                </g> : <>
                  <defs>
                    {node.text.lines.map((line, lineIndex) => <path key={lineIndex} id={`${nameId}-${lineIndex}`}
                      d={labelArc(node, layout.center, node.labelRadius + (node.reverseLabel ? 1 : -1) * line.y)} />)}
                  </defs>
                  {node.text.lines.map((line, lineIndex) => <text key={lineIndex} className={line.date ? styles.date : styles.label}
                    data-label-kind={line.date ? 'date' : 'name'} data-label-width={node.text.width} fontSize={line.fontSize}
                    dominantBaseline="central">
                    <textPath href={`#${nameId}-${lineIndex}`} startOffset="50%" textAnchor="middle">{line.text}</textPath>
                  </text>)}
                </>}
              </g>
            })}
            <g data-layer="connections">
              {layout.edges.map((edge) => {
                const relation = graph.relationships.get(edge.relationshipId)!
                const path = connectionPath(nodes.get(edge.fromAppearanceId)!, nodes.get(edge.toAppearanceId)!, layout.center)
                const action = () => selectRelation(relation.id)
                return <g key={`${edge.fromAppearanceId}/${edge.toAppearanceId}`} className={styles.connection}
                  data-relationship-id={relation.id} data-selected={selected?.id === relation.id}
                  data-uncertain={relation.confidence !== 'confirmed' || relation.reviewStatus === 'disputed'}
                  role="button" tabIndex={0} aria-pressed={selected?.id === relation.id}
                  aria-label={`Зв’язок ${relations.findIndex((entry) => entry.id === relation.id) + 1}: ${relationshipName(family, relation)}. ${confidenceLabels[relation.confidence]}`}
                  onClick={(event) => selectRelation(event.detail === 0 ? relation.id
                    : closestRelationship(container.current!, event.clientX, event.clientY) ?? relation.id)}
                  onKeyDown={(event) => activate(event, action)}>
                  <title>{relationshipName(family, relation)} · {confidenceLabels[relation.confidence]}</title>
                  <path className={styles.hit} data-hit="true" d={path} />
                  <path className={styles.line} d={path} />
                </g>
              })}
            </g>
          </g>
        </g>
      </svg>
    </div>
    <PersonTooltip key={`${personId}/${zoom}/${pan.x}/${pan.y}/${generations}/${expanded}`} container={container} />
    {projection.truncated && <p role="status">Показано частину гілок. Інші люди доступні в покажчику.</p>}
    <div aria-live="polite" aria-atomic="true">
      {selected && <div className={styles.selection} data-testid="relationship-details" data-relationship-id={selected.id}>
        <h3>Вибраний зв’язок · {relations.indexOf(selected) + 1}</h3>
        <p>{relationshipName(family, selected)}</p>
        <p><strong>{confidenceLabels[selected.confidence]}</strong>{selected.reviewStatus === 'disputed' ? ' · Потребує уточнення' : ''}</p>
        {selected.explanation && <p>{selected.explanation}</p>}
        <details><summary>Докази вибраного зв’язку</summary><EvidenceForTarget target={{ kind: 'relationship', id: selected.id }} /></details>
        <button onClick={() => dispatch({ type: 'relationship', id: null })}>Зняти вибір зв’язку</button>
      </div>}
    </div>
  </section>
}
