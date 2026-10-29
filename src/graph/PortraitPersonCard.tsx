import { useId } from 'react'
import type { PersonCardSkin } from './person-card-skin'
import { portraitTextLines, type PortraitCardMetrics } from './portrait-card-layout'
import styles from './PortraitPersonCard.module.css'

function RoleSymbol({ skin }: { skin: PersonCardSkin }) {
  if (skin.badgeIcon === 'sewing-machine') return <path d="M-12 10h24v3h-24zm3-17h4v2h10c4 0 6 2 6 6v5H5V1c0-1-1-2-2-2H-5v7h-4zm14-4h2v5H5zM-7 5h1v5h-1z" />
  if (skin.id.startsWith('potter')) return <path d="M-6-12H6v3H-6zm0 5H6c-2 3 5 5 5 10 0 4-3 8-5 10H-6c-2-2-5-6-5-10 0-5 7-7 5-10Z" />
  if (skin.id.startsWith('peasant')) return <><path d="M0-13v26" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M0-6c-6 0-9-5-8-8 5 0 8 3 8 8Zm1 7c0-6 4-9 8-9 1 4-3 9-8 9Zm-1 5c-6 0-9-4-9-8 5 0 9 3 9 8Zm1 6c0-5 4-8 8-8 0 5-3 8-8 8Z" /></>
  if (skin.id === 'cossack-male') return <><path d="m-10-11 19 22M10-11-9 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="m-12 5 6 6m12 0 6-6" stroke="currentColor" strokeWidth="2" /></>
  return <>{Array.from({ length: 6 }, (_, index) => <ellipse key={index} cx="0" cy="-7" rx="3" ry="5" transform={`rotate(${index * 60})`} />)}<circle r="2.5" /></>
}

export function PortraitPersonCard({ x, y, name, years, skin, metrics: m, artworkId, measureName, measureYears }: {
  x: number; y: number; name: string; years: string; skin: PersonCardSkin; metrics: PortraitCardMetrics
  artworkId: string; measureName: (text: string) => number; measureYears: (text: string) => number
}) {
  const id = useId().replaceAll(':', '')
  const left = x - m.width / 2, top = y - m.height / 2
  const names = portraitTextLines(name, m.textWidth, text => measureName(text) * m.nameSize / 24, true)
  const dates = portraitTextLines(years, m.textWidth, text => measureYears(text) * m.yearSize / 15)
  const radius = skin.portrait?.radius ?? 100
  return <>
    <rect className={styles.frame} data-tone={skin.tone} x={left} y={top} width={m.width} height={m.height} rx="12" />
    <g className={styles.art} data-tone={skin.tone} transform={`translate(${left} ${top})`} pointerEvents="none" aria-hidden="true">
      <defs>
        {skin.portrait && <pattern id={`${id}-portrait`} x={(m.width - m.portraitSize) / 2} y={m.portraitTop}
          width={m.portraitSize} height={m.portraitSize} patternUnits="userSpaceOnUse"
          viewBox={`${skin.portrait.x - radius} ${skin.portrait.y - radius} ${radius * 2} ${radius * 2}`}>
          <use href={`#${artworkId}${skin.portrait.artwork ? `-${skin.portrait.artwork}` : ''}`} />
        </pattern>}
        <g id={`${id}-stitch`} fill="currentColor">
          <path d="M0-7 7 0 0 7-7 0Zm0 3L-4 0l4 4 4-4Z" fillRule="evenodd" />
          <path d="m0-12 2 2-2 2-2-2Zm0 20 2 2-2 2-2-2Zm-10-10 2 2-2 2-2-2Zm20 0 2 2-2 2-2-2Z" />
        </g>
      </defs>
      {[12, m.width - 12].map(edge => <g key={edge} className={styles.ornament}>
        {Array.from({ length: Math.floor((m.height - 28) / 24) }, (_, row) =>
          <use key={row} href={`#${id}-stitch`} transform={`translate(${edge} ${24 + row * 24}) scale(.58)`} />)}
      </g>)}
      <circle className={styles.ring} cx={m.width / 2} cy={m.portraitTop + m.portraitSize / 2} r={m.portraitSize / 2 + 3} />
      {skin.portrait ? <circle data-card-portrait="true" cx={m.width / 2} cy={m.portraitTop + m.portraitSize / 2}
        r={m.portraitSize / 2} fill={`url(#${id}-portrait)`} />
        : <g className={styles.silhouette} transform={`translate(${m.width / 2} ${m.portraitTop + m.portraitSize / 2}) scale(${m.portraitSize / 100})`}>
          <circle r="49" className={styles.emptyPortrait} /><circle cy="-10" r="15" /><path d="M-30 35v-6a30 22 0 0 1 60 0v6Z" />
        </g>}
      <circle className={styles.badge} cx={m.width / 2} cy={m.badgeY} r={m.badgeRadius} />
      <g className={styles.symbol} transform={`translate(${m.width / 2} ${m.badgeY}) scale(${m.badgeRadius / 23})`}><RoleSymbol skin={skin} /></g>
      <text className={styles.role} x={m.width / 2} y={m.labelY} fontSize={m.nameSize * .78} textAnchor="middle">{skin.label}</text>
      {names.map((line, index) => <text key={index} className={styles.name} data-card-name="true" x={m.width / 2}
        y={m.nameY + index * m.nameStep} fontSize={m.nameSize} textAnchor="middle">{line}</text>)}
      {dates.map((line, index) => <text key={index} className={styles.years} data-card-years="true" x={m.width / 2}
        y={m.yearsY + index * (m.yearSize + 3)} fontSize={m.yearSize} textAnchor="middle">{line}</text>)}
    </g>
  </>
}
