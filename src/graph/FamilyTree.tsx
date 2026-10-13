import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { personName } from '../data/person-name'
import { confidenceLabels } from '../data/schema'
import { useFamily, useView } from '../navigation/context'
import { EvidenceForTarget } from '../room/Evidence'
import { availableGenerations, buildFamilyGraph, projectFamily } from './projection'
import { layoutTree, type TreeOrientation } from './tree-layout'
import { lifeYears, relationshipName } from './presentation'
import { useMapCamera } from './useMapCamera'
import { useMapViewport } from './useMapViewport'
import { useMapExpansion } from './useMapExpansion'
import { fitCamera, maxZoom, minZoom, scaleCamera } from './camera'
import { closestRelationship } from './closest-relationship'
import { downloadSvgAsPng } from './export-png'
import shared from './RadialMap.module.css'
import styles from './FamilyTree.module.css'

function activate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action() }
}

export function FamilyTree({ personId, orientation }: { personId: string; orientation: TreeOrientation }) {
  const title = orientation === 'vertical' ? 'Вертикальний родовід' : 'Горизонтальний родовід'
  const directionHint = orientation === 'vertical' ? 'Предки зверху, нащадки знизу, подружжя поруч.' : 'Предки праворуч, нащадки ліворуч.'
  const family = useFamily()
  const { state, dispatch, goTo, goBack } = useView()
  const container = useRef<HTMLDivElement>(null)
  const svg = useRef<SVGSVGElement>(null)
  const { width, height } = useMapViewport(container)
  const { expanded, toggleExpansion } = useMapExpansion(container)
  const [exportState, setExportState] = useState<'idle' | 'exporting' | 'saved' | 'error'>('idle')
  const prefix = useId()
  const graph = useMemo(() => buildFamilyGraph(family), [family])
  const labels = useMemo(() => new Map(family.people.map(person => [person.id, personName(family, person.id)])), [family])
  const dates = useMemo(() => new Map(family.people.map(person => [person.id, lifeYears(family, person.id)])), [family])
  const measure = useMemo(() => {
    const contexts = new Map<number, CanvasRenderingContext2D | null>()
    for (const size of [18, 20]) {
      const context = document.createElement('canvas').getContext('2d')
      if (context) context.font = `${size}px system-ui, sans-serif`
      contexts.set(size, context)
    }
    return (text: string, size: number) => {
      return (contexts.get(size)?.measureText(text).width ?? Array.from(text).length * size) * 1.03
    }
  }, [])
  const settings = state.current.map
  const maxGenerations = useMemo(() => availableGenerations(graph, personId), [graph, personId])
  const generations = Math.min(settings.generations, maxGenerations)
  const projection = useMemo(() => projectFamily(graph, personId, { generations: Math.min(12, generations + 1),
    collapsedAppearanceIds: settings.collapsedAppearanceIds }), [graph, personId, generations, settings.collapsedAppearanceIds])
  const layout = useMemo(() => layoutTree(projection, labels, dates, measure, orientation), [projection, labels, dates, measure, orientation])
  const center = layout.nodes.find(node => node.lane === 'center')!
  const offset = { x: width / 2 - center.x, y: height / 2 - center.y }
  useMapCamera(container, width, settings, dispatch, height)
  const relations = [...new Set(projection.edges.map(edge => edge.relationshipId))].map(id => graph.relationships.get(id)!)
  const selected = relations.find(relation => relation.id === state.current.selectedRelationshipId)
  const changeScale = (factor: number) => dispatch({ type: 'map', settings: scaleCamera(settings, factor) })
  const savePng = async () => {
    if (!svg.current) return
    setExportState('exporting')
    try {
      await downloadSvgAsPng(svg.current, `rodovid-${orientation}-${personId}.png`)
      setExportState('saved')
    } catch { setExportState('error') }
  }
  return <section className={shared.map} aria-label={title}
    data-map-expanded={expanded} role={expanded ? 'dialog' : undefined} aria-modal={expanded || undefined}>
    <p className={shared.hint}>{directionHint} Натисніть ім’я, щоб змінити центр, або лінію, щоб переглянути докази. Кнопка «Назад» повертає до попереднього перегляду.</p>
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
      <select id={`${prefix}-generations`} value={generations} onChange={event => dispatch({ type: 'map', settings: { generations: Number(event.target.value) } })}>
        {Array.from({ length: maxGenerations }, (_, index) => index + 1).map(depth => <option key={depth} value={depth}>{depth}</option>)}
      </select>
    </div>
    {exportState !== 'idle' && <p className={shared.exportStatus} role="status">{exportState === 'exporting' ? 'Створюємо PNG високої якості…'
      : exportState === 'saved' ? 'PNG збережено у файл.' : 'Не вдалося створити PNG. Спробуйте ще раз.'}</p>}
    <div ref={container} className={styles.canvas} data-map-viewport>
      <svg ref={svg} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${title}: ${labels.get(personId)}`}>
        <g data-layer="camera" transform={`translate(${settings.pan.x * width} ${settings.pan.y * height}) scale(${settings.zoom})`}>
          <g data-layer="coordinates"><g transform={`translate(${offset.x} ${offset.y})`}>
            <g data-layer="connections">{layout.edges.map(edge => {
              const relation = graph.relationships.get(edge.relationshipId)!
              const action = () => dispatch({ type: 'relationship', id: relation.id })
              return <g key={`${edge.fromAppearanceId}/${edge.toAppearanceId}`} className={styles.connection}
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
              const action = () => goTo(`/${central ? 'person' : orientation}/${node.personId}`)
              return <g key={node.appearanceId} className={styles.node} data-person-id={node.personId}
                data-appearance-id={node.appearanceId} data-center={central} data-lane={node.lane}
                data-parent-appearance-id={node.parentAppearanceId ?? undefined}
                role="link" tabIndex={0} onClick={event => { if (event.detail < 2) action() }} onKeyDown={event => activate(event, action)}
                aria-label={`${central ? 'У центрі. Відкрити кімнату' : 'Показати в центрі'}: ${labels.get(node.personId)}. ${dates.get(node.personId)}${hidden ? '. Є родичі поза цим показом' : ''}`}>
                <title>{labels.get(node.personId)} · {dates.get(node.personId)}</title>
                <rect className={styles.card} x={node.x - node.width / 2} y={node.y - node.height / 2} width={node.width} height={node.height} rx="10" />
                {node.text.lines.map((line, index) => <text key={index} className={line.date ? styles.date : styles.label}
                  x={node.x} y={node.y + line.y} fontSize={line.fontSize} textAnchor="middle" dominantBaseline="central">{line.text}</text>)}
                {hidden && <text className={styles.marker} x={node.x + node.width / 2 - 10} y={node.y - node.height / 2 + 16} textAnchor="end">↗</text>}
              </g>
            })}
          </g></g>
        </g>
      </svg>
    </div>
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
