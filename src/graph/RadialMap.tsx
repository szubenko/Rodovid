import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ViewLink as Link } from '../navigation/ViewLink'
import { personName } from '../data/load-family'
import { confidenceLabels } from '../data/schema'
import { useFamily, useView } from '../navigation/context'
import { buildFamilyGraph, projectFamily } from './projection'
import { fitLabel, layoutRadial } from './layout'
import { connectionPath, labelArc, lifeYears, relationshipName, sectorPath } from './presentation'
import styles from './RadialMap.module.css'
import { useMapTransition } from './useMapTransition'
import { useMapCamera } from './useMapCamera'
import { maxZoom, minZoom, scaleCamera } from './camera'
import { EvidenceForTarget } from '../room/Evidence'
import { emptySectors } from './empty-sectors'
import { nameLines, radialLabel } from './radial-label'

function activate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); action() }
}

export function RadialMap({ personId }: { personId: string }) {
  const family = useFamily()
  const { state, dispatch, goTo } = useView()
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(320)
  const prefix = useId()
  const measureText = useMemo(() => {
    // Each context keeps one font; measurement never mutates a memoized object.
    const contexts = new Map<string, CanvasRenderingContext2D | null>()
    for (const [size, serif] of [[12, false], [14, false], [18, false], [20, true], [32, true]] as const) {
      const context = document.createElement('canvas').getContext('2d')
      if (context) context.font = `${size}px ${serif ? 'Georgia, "Times New Roman", serif' : 'system-ui, sans-serif'}`
      contexts.set(`${size}-${serif}`, context)
    }
    return (text: string, size: number, serif = size === 20 || size === 32) => {
      return contexts.get(`${size}-${serif}`)?.measureText(text).width ?? Array.from(text).length * size
    }
  }, [])
  useEffect(() => {
    const element = container.current!
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(160, Math.min(10000, entry.contentRect.width)))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const graph = useMemo(() => buildFamilyGraph(family), [family])
  const labels = useMemo(() => new Map(family.people.map((person) => [person.id, personName(family, person.id)])), [family])
  const years = useMemo(() => new Map(family.people.map((person) => [person.id, lifeYears(family, person.id)])), [family])
  const mapSettings = state.current.map
  const { generations, collapsedAppearanceIds, pan, zoom } = mapSettings
  const projection = useMemo(() => projectFamily(graph, personId, { generations: Math.min(12, generations + 1), collapsedAppearanceIds }), [graph, personId, generations, collapsedAppearanceIds])
  const layout = useMemo(() => layoutRadial(projection, { width, height: width, labels, measureText,
    fontSize: width < 550 ? 12 : 18, centerFontSize: width < 550 ? 20 : 32 }), [projection, width, labels, measureText])
  const empty = useMemo(() => emptySectors(layout, projection.generations - 1), [layout, projection.generations])
  const dateFontSize = width < 550 ? 12 : 14
  const labelZoom = Math.max(1, zoom)
  // Reflow radial labels at a stable screen size as zoom reveals more room.
  const radialMeasure = (text: string, size: number) => measureText(text, 12, false) * size / 12
  const renderedCamera = useMemo(() => ({ ...mapSettings, pan: { x: pan.x * width, y: pan.y * width } }), [mapSettings, pan.x, pan.y, width])
  useMapCamera(container, width, mapSettings, dispatch)
  useMapTransition(container, layout, personId, renderedCamera)
  const nodes = new Map(layout.nodes.map((node) => [node.appearanceId, node]))
  const visiblePeople = [...new Set(layout.nodes.map((node) => node.personId))]
  const relations = [...new Set(layout.edges.map((edge) => edge.relationshipId))].map((id) => graph.relationships.get(id)!)
  const selected = relations.find((relation) => relation.id === state.current.selectedRelationshipId)
  const selectRelation = (id: string) => dispatch({ type: 'relationship', id })
  const changeScale = (factor: number) => dispatch({ type: 'map', settings: scaleCamera(mapSettings, factor) })
  const moveCamera = (x: number, y: number) => dispatch({ type: 'map', settings: { pan: { x: pan.x + x, y: pan.y + y } } })
  const toggleBranch = (id: string) => dispatch({ type: 'map', settings: { collapsedAppearanceIds:
    collapsedAppearanceIds.includes(id) ? collapsedAppearanceIds.filter((entry) => entry !== id) : [...collapsedAppearanceIds, id] } })
  const expandedIds = new Set(layout.nodes.map((node) => node.parentAppearanceId))
  const branches = layout.nodes.filter((node) => !node.cycle && (expandedIds.has(node.appearanceId)
    || node.hiddenConnections.some((connection) => connection.reason === 'collapsed' || connection.reason === 'depth')))

  return <section className={styles.map} aria-label="Радіальна карта родини">
    <p className={styles.hint}>Натисніть ім’я, щоб змінити центр. Зв’язки та їхні докази доступні під картою.</p>
    <div className={styles.controls} role="group" aria-label="Керування картою">
      <button aria-label="Зменшити масштаб" disabled={zoom <= minZoom} onClick={() => changeScale(1 / 1.25)}>−</button>
      <output aria-label="Масштаб карти">{Math.round(zoom * 100)}%</output>
      <button aria-label="Збільшити масштаб" disabled={zoom >= maxZoom} onClick={() => changeScale(1.25)}>+</button>
      <button onClick={() => dispatch({ type: 'map', settings: { zoom: 1, pan: { x: 0, y: 0 } } })}>Вмістити карту</button>
      <label htmlFor={`${prefix}-generations`}>Покоління</label>
      <select id={`${prefix}-generations`} value={generations} onChange={(event) => dispatch({ type: 'map', settings: { generations: Number(event.target.value) } })}>
        {Array.from({ length: 11 }, (_, index) => index + 1).map((depth) => <option key={depth} value={depth}>{depth}</option>)}
      </select>
    </div>
    <div className={styles.controls} role="group" aria-label="Переміщення карти">
      <button aria-label="Перемістити карту ліворуч" onClick={() => moveCamera(-0.12, 0)}>←</button>
      <button aria-label="Перемістити карту вгору" onClick={() => moveCamera(0, -0.12)}>↑</button>
      <button aria-label="Перемістити карту вниз" onClick={() => moveCamera(0, 0.12)}>↓</button>
      <button aria-label="Перемістити карту праворуч" onClick={() => moveCamera(0.12, 0)}>→</button>
    </div>
    <p id={`${prefix}-gestures`} className={styles.hint}>Перетягуйте карту мишею або пальцем. Масштаб — двома пальцями, Ctrl + колесо або кнопками. Прокручуйте сторінку поза картою. Покоління — кількість кілець предків навколо центру; подружжя не додає покоління.</p>
    <div ref={container} className={styles.canvas}>
      <svg viewBox={`0 0 ${width} ${width}`} role="group" aria-label={`Родина: ${labels.get(personId)}`} aria-describedby={`${prefix}-gestures`}>
        <g data-layer="camera" transform={`translate(${renderedCamera.pan.x} ${renderedCamera.pan.y}) scale(${zoom})`}>
          <g data-layer="coordinates">
            <g data-layer="empty-sectors" aria-hidden="true">
              {empty.map((sector, index) => {
                return <g key={index} className={styles.empty} data-lane={sector.lane} data-branch={sector.startAngle < 0 ? 'left' : 'right'}>
                  <path className={styles.sector} d={sectorPath(sector, layout.center)} />
                  <path className={styles.rim} d={labelArc({ ...sector, reverseLabel: false }, layout.center, sector.outerRadius)} />
                </g>
              })}
            </g>
            {[...layout.nodes].sort((a, b) => Number(a.lane === 'center') - Number(b.lane === 'center')).map((node, index) => {
              const central = node.lane === 'center'
              const date = years.get(node.personId)!
              const nameId = `${prefix}-name-${index}`
              const dateId = `${prefix}-date-${index}`
              const hidden = node.hiddenConnections.some((connection) => connection.reason !== 'recenter')
              const arcWidth = Math.max(0, (node.labelRadius - 12) * (node.endAngle - node.startAngle) * Math.PI / 180 - 20)
              const arcLines = node.outerRadius - node.innerRadius > 64
                ? nameLines(node.fullLabel, arcWidth, (text) => measureText(text, node.fontSize)) : [node.label]
              const datesFit = central ? layout.centerRadius > 50 : node.outerRadius - node.innerRadius > 42
              const dateRadius = node.labelRadius + (node.reverseLabel ? 1 : -1) * (arcLines.length > 1 ? 30 : 17)
              const dateWidth = central ? node.labelWidth : Math.max(0, dateRadius * (node.endAngle - node.startAngle) * Math.PI / 180 - 20)
              const dateLabel = datesFit && !(central && width < 550 && node.centerLines.length > 2)
                ? fitLabel(date === 'Роки життя невідомі' ? 'Дати не вказані' : date, dateWidth, (text) => measureText(text, dateFontSize, false)) : ''
              const radial = node.lane === 'parents' && node.ring >= 3
                ? radialLabel(node, layout.center, node.fullLabel, date === 'Роки життя невідомі' ? 'Дати не вказані' : date,
                  node.fontSize / labelZoom, dateFontSize / labelZoom, radialMeasure) : null
              const action = () => goTo(`/${central ? 'person' : 'tree'}/${node.personId}`)
              return <g key={node.appearanceId} className={styles.node} data-person-id={node.personId}
                data-appearance-id={node.appearanceId} data-center={central} data-lane={node.lane} data-ring={node.ring} data-branch={node.startAngle < 0 ? 'left' : 'right'}
                role="link" tabIndex={0} onClick={(event) => { if (event.detail < 2) action() }} onKeyDown={(event) => activate(event, action)}
                aria-label={`${central ? 'У центрі. Відкрити кімнату' : 'Показати в центрі'}: ${node.fullLabel}. ${date}${hidden ? '. Є родичі поза цим показом' : ''}`}>
                <title>{node.fullLabel} · {date}{hidden ? ' · Є інші родичі ↗' : ''}</title>
                {central ? <circle className={styles.sector} cx={node.x} cy={node.y} r={layout.centerRadius} />
                  : <><path className={styles.sector} d={sectorPath(node, layout.center)} />
                    <path className={styles.rim} d={labelArc({ ...node, reverseLabel: false }, layout.center, node.outerRadius)} /></>}
                {central ? <>
                  <circle className={styles.centerInset} cx={node.x} cy={node.y} r={layout.centerRadius - 3} />
                  {(width >= 550 || node.centerLines.length < 3) && <text className={styles.centerCaption} x={node.x} y={node.y + layout.centerRadius * (width < 550 ? 0.7 : 0.65)}>{personId === state.homePersonId ? 'Домашня особа' : 'У центрі карти'}</text>}
                  {node.centerLines.map((line, lineIndex) => <text key={lineIndex} className={styles.label}
                    data-label-width={node.labelWidth} fontSize={node.fontSize} x={node.x} y={node.y - layout.centerRadius * 0.22 + (lineIndex - (node.centerLines.length - 1) / 2) * node.fontSize * 1.2}
                    textAnchor="middle" dominantBaseline="middle">{line}</text>)}
                  {dateLabel && <text className={styles.date} fontSize={dateFontSize} data-label-width={dateWidth} x={node.x} y={node.y + layout.centerRadius * (width < 550 ? 0.4 : 0.28)} textAnchor="middle">{dateLabel}</text>}
                </> : radial ? <g data-label-orientation="radial"
                  transform={`translate(${radial.x} ${radial.y}) rotate(${radial.rotation})`}>
                  {radial.lines.map((line, lineIndex) => <text key={lineIndex} className={line.date ? styles.date : styles.label}
                    data-label-kind={line.date ? 'date' : 'name'}
                    fontSize={(line.date ? dateFontSize : node.fontSize) / labelZoom} data-label-width={radial.width}
                    x={0} y={line.y} textAnchor="middle" dominantBaseline="central">{line.text}</text>)}
                </g> : <>
                  <defs>
                    {arcLines.map((_, lineIndex) => <path key={lineIndex} id={`${nameId}-${lineIndex}`}
                      d={labelArc(node, layout.center, node.labelRadius + (node.reverseLabel ? -1 : 1) * (arcLines.length > 1 ? 12 - lineIndex * 24 : 0))} />)}
                    <path id={dateId} d={labelArc(node, layout.center, dateRadius)} />
                  </defs>
                  {arcLines.map((line, lineIndex) => <text key={lineIndex} className={styles.label} fontSize={node.fontSize}
                    data-label-kind="name" data-label-width={arcLines.length > 1 ? arcWidth : node.labelWidth}>
                    <textPath href={`#${nameId}-${lineIndex}`} startOffset="50%" textAnchor="middle">{line}</textPath>
                  </text>)}
                  {dateLabel && <text className={styles.date} fontSize={dateFontSize} data-label-width={dateWidth}>
                    <textPath href={`#${dateId}`} startOffset="50%" textAnchor="middle">{dateLabel}</textPath>
                  </text>}
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
                  onClick={action} onKeyDown={(event) => activate(event, action)}>
                  <title>{relationshipName(family, relation)} · {confidenceLabels[relation.confidence]}</title>
                  <path className={styles.hit} d={path} />
                  <path className={styles.line} d={path} />
                </g>
              })}
            </g>
          </g>
        </g>
      </svg>
    </div>
    <p className={styles.legend}>Предки — вгорі · Подружжя та діти — внизу<br />Золотий круг — центр · Червона лінія — вибраний зв’язок · Пунктир — є невизначеність</p>
    <details className={styles.details}>
      <summary>Гілки карти · згорнуто {collapsedAppearanceIds.length}</summary>
      <p className={styles.hint}>Згортання приховує продовження конкретного сектора. Люди залишаються в покажчику. Для бічних родичів виберіть людину новим центром.</p>
      {collapsedAppearanceIds.length > 0 && <button onClick={() => dispatch({ type: 'map', settings: { collapsedAppearanceIds: [] } })}>Розгорнути всі гілки</button>}
      <div className={styles.relationships}>
        {branches.map((node, index) => {
          const collapsed = collapsedAppearanceIds.includes(node.appearanceId)
          const parent = node.parentAppearanceId ? nodes.get(node.parentAppearanceId) : undefined
          const depthLimited = node.hiddenConnections.some((connection) => connection.reason === 'depth')
          return <div className={styles.branch} key={node.appearanceId} data-branch-appearance={node.appearanceId}>
            <strong>{index + 1}. {node.fullLabel}</strong>
            <span>{node.lane === 'center' ? 'Від центру' : node.lane === 'parents' ? 'Предки' : 'Нащадки'}{parent ? ` · через ${parent.fullLabel}` : ''}</span>
            <button aria-label={`${collapsed ? 'Розгорнути' : 'Згорнути'} гілку ${index + 1}: ${node.fullLabel}`} aria-expanded={!collapsed} onClick={() => toggleBranch(node.appearanceId)}>{collapsed ? 'Розгорнути гілку' : 'Згорнути гілку'}</button>
            {(collapsed || depthLimited) && <span>↗ Є приховані родичі{depthLimited ? ' — збільште кількість поколінь' : ''}.</span>}
          </div>
        })}
        {branches.length === 0 && <p>Для цього показу немає гілок для згортання.</p>}
      </div>
    </details>
    {projection.truncated && <p role="status">Показано частину гілок. Інші люди доступні в покажчику.</p>}
    <div className={styles.selection} aria-live="polite" aria-atomic="true">
      {selected ? <div data-testid="relationship-details" data-relationship-id={selected.id}>
        <h3>Вибраний зв’язок · {relations.indexOf(selected) + 1}</h3>
        <p>{relationshipName(family, selected)}</p>
        <p><strong>{confidenceLabels[selected.confidence]}</strong>{selected.reviewStatus === 'disputed' ? ' · Потребує уточнення' : ''}</p>
        {selected.explanation && <p>{selected.explanation}</p>}
        <details><summary>Докази вибраного зв’язку</summary><EvidenceForTarget target={{ kind: 'relationship', id: selected.id }} /></details>
        <button onClick={() => dispatch({ type: 'relationship', id: null })}>Зняти вибір зв’язку</button>
      </div> : <p>Виберіть лінію або запис у списку зв’язків нижче, щоб побачити людей та наявну оцінку.</p>}
    </div>
    <details className={styles.details} open>
      <summary>Повні імена на карті · {visiblePeople.length}</summary>
      <div className={styles.people}>
        {visiblePeople.map((id) => <Link key={id} to={`/tree/${id}`} aria-current={id === personId ? 'page' : undefined}>
          <strong>{labels.get(id)}</strong><span>{years.get(id)}</span>
          {layout.nodes.some((node) => node.personId === id && node.hiddenConnections.length > 0) && <span>↗ Є інші родичі</span>}
        </Link>)}
      </div>
    </details>
    <details className={styles.details}>
      <summary>Зв’язки на карті · {relations.length}</summary>
      <p className={styles.hint}>Кожен запис відповідає окремому зв’язку. Повторні сімейні записи збережено.</p>
      <div className={styles.relationships}>
        {relations.map((relation, index) => <button key={relation.id} data-relationship-id={relation.id}
          aria-pressed={selected?.id === relation.id} onClick={() => selectRelation(relation.id)}>
          <strong>{index + 1}. {relationshipName(family, relation)}</strong>
          <span>{confidenceLabels[relation.confidence]}{relation.reviewStatus === 'disputed' ? ' · Потребує уточнення' : ''}</span>
        </button>)}
        {relations.length === 0 && <p>Для цього показу зв’язків немає.</p>}
      </div>
    </details>
  </section>
}
