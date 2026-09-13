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
    for (const [size, serif] of [[12, true], [18, true], [12, false]] as const) {
      const context = document.createElement('canvas').getContext('2d')
      if (context) context.font = `${size}px ${serif ? 'Georgia, "Times New Roman", serif' : 'system-ui, sans-serif'}`
      contexts.set(`${size}-${serif}`, context)
    }
    return (text: string, size: number, serif = true) => {
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
  const projection = useMemo(() => projectFamily(graph, personId, { generations, collapsedAppearanceIds }), [graph, personId, generations, collapsedAppearanceIds])
  const layout = useMemo(() => layoutRadial(projection, { width, height: width, labels, measureText, fontSize: width < 550 ? 12 : 18 }), [projection, width, labels, measureText])
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
    <p className={styles.hint}>Натисніть сектор, щоб змінити центр, або лінію, щоб переглянути зв’язок. ↗ — є родичі поза цим показом.</p>
    <div className={styles.controls} role="group" aria-label="Керування картою">
      <button aria-label="Зменшити масштаб" disabled={zoom <= minZoom} onClick={() => changeScale(1 / 1.25)}>−</button>
      <output aria-label="Масштаб карти">{Math.round(zoom * 100)}%</output>
      <button aria-label="Збільшити масштаб" disabled={zoom >= maxZoom} onClick={() => changeScale(1.25)}>+</button>
      <button onClick={() => dispatch({ type: 'map', settings: { zoom: 1, pan: { x: 0, y: 0 } } })}>Вмістити карту</button>
      <label htmlFor={`${prefix}-generations`}>Покоління</label>
      <select id={`${prefix}-generations`} value={generations} onChange={(event) => dispatch({ type: 'map', settings: { generations: Number(event.target.value) } })}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((depth) => <option key={depth} value={depth}>{depth}</option>)}
      </select>
    </div>
    <div className={styles.controls} role="group" aria-label="Переміщення карти">
      <button aria-label="Перемістити карту ліворуч" onClick={() => moveCamera(-0.12, 0)}>←</button>
      <button aria-label="Перемістити карту вгору" onClick={() => moveCamera(0, -0.12)}>↑</button>
      <button aria-label="Перемістити карту вниз" onClick={() => moveCamera(0, 0.12)}>↓</button>
      <button aria-label="Перемістити карту праворуч" onClick={() => moveCamera(0.12, 0)}>→</button>
    </div>
    <p id={`${prefix}-gestures`} className={styles.hint}>Перетягуйте карту мишею або пальцем. Масштаб — двома пальцями, Ctrl + колесо або кнопками. Прокручуйте сторінку поза картою. Покоління задають глибину від центру; подружжя не додає покоління.</p>
    <div ref={container} className={styles.canvas}>
      <svg viewBox={`0 0 ${width} ${width}`} role="group" aria-label={`Родина: ${labels.get(personId)}`} aria-describedby={`${prefix}-gestures`}>
        <g data-layer="camera" transform={`translate(${renderedCamera.pan.x} ${renderedCamera.pan.y}) scale(${zoom})`}>
          <g data-layer="coordinates">
            {[...layout.nodes].sort((a, b) => Number(a.lane === 'center') - Number(b.lane === 'center')).map((node, index) => {
              const central = node.lane === 'center'
              const date = years.get(node.personId)!
              const nameId = `${prefix}-name-${index}`
              const dateId = `${prefix}-date-${index}`
              const datesFit = central ? layout.centerRadius > 50 : node.outerRadius - node.innerRadius > 42
              const dateRadius = node.labelRadius + (node.reverseLabel ? -16 : 16)
              const dateWidth = central ? node.labelWidth : Math.max(0, dateRadius * (node.endAngle - node.startAngle) * Math.PI / 180 - 20)
              const dateLabel = datesFit && date !== 'Роки життя невідомі' ? fitLabel(date, dateWidth, (text) => measureText(text, 12, false)) : ''
              const hidden = node.hiddenConnections.length > 0
              const nameLabel = hidden && node.labelWidth > node.fontSize * 3
                ? `${fitLabel(node.fullLabel, node.labelWidth - measureText(' ↗', node.fontSize), (text) => measureText(text, node.fontSize))} ↗` : node.label
              const action = () => goTo(`/${central ? 'person' : 'tree'}/${node.personId}`)
              return <g key={node.appearanceId} className={styles.node} data-person-id={node.personId}
                data-appearance-id={node.appearanceId} data-center={central} data-lane={node.lane} data-branch={node.startAngle < 0 ? 'left' : 'right'}
                role="link" tabIndex={0} onClick={(event) => { if (event.detail < 2) action() }} onKeyDown={(event) => activate(event, action)}
                aria-label={`${central ? 'У центрі. Відкрити кімнату' : 'Показати в центрі'}: ${node.fullLabel}. ${date}${hidden ? '. Є родичі поза цим показом' : ''}`}>
                <title>{node.fullLabel} · {date}{hidden ? ' · Є інші родичі ↗' : ''}</title>
                {central ? <circle className={styles.sector} cx={node.x} cy={node.y} r={layout.centerRadius} />
                  : <path className={styles.sector} d={sectorPath(node, layout.center)} />}
                {central ? <>
                  <text className={styles.centerCaption} x={node.x} y={node.y - layout.centerRadius + 23}>У центрі</text>
                  {node.centerLines.map((line, lineIndex) => <text key={lineIndex} className={styles.label}
                    data-label-width={node.labelWidth} fontSize={node.fontSize} x={node.x} y={node.y + (lineIndex - (node.centerLines.length - 1) / 2) * node.fontSize * 1.2}
                    textAnchor="middle" dominantBaseline="middle">{line}</text>)}
                  {dateLabel && <text className={styles.date} data-label-width={dateWidth} x={node.x} y={node.y + layout.centerRadius - 23} textAnchor="middle">{dateLabel}</text>}
                </> : <>
                  <defs><path id={nameId} d={labelArc(node, layout.center)} /><path id={dateId} d={labelArc(node, layout.center, dateRadius)} /></defs>
                  <text className={styles.label} fontSize={node.fontSize} data-label-width={node.labelWidth}>
                    <textPath href={`#${nameId}`} startOffset="50%" textAnchor="middle">{nameLabel}</textPath>
                  </text>
                  {dateLabel && <text className={styles.date} data-label-width={dateWidth}>
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
