import { memo, useId } from 'react'
import type { PersonCardSkin } from './person-card-skin'
import { portraitOrnamentInset, portraitTextLines, type PortraitCardMetrics } from './portrait-card-layout'
import { RecruitSymbol } from './RecruitSymbol'
import { ShacklesSymbol } from './ShacklesSymbol'
import styles from './PortraitPersonCard.module.css'

function RoleSymbol({ skin }: { skin: PersonCardSkin }) {
  if (skin.badgeIcon === 'recruit') return <RecruitSymbol />
  if (skin.badgeIcon === 'shackles') return <ShacklesSymbol />
  if (skin.badgeIcon === 'sewing-machine') return <path d="M-12 10h24v3h-24zm3-17h4v2h10c4 0 6 2 6 6v5H5V1c0-1-1-2-2-2H-5v7h-4zm14-4h2v5H5zM-7 5h1v5h-1z" />
  if (skin.id.startsWith('potter')) return <path d="M-6-12H6v3H-6zm0 5H6c-2 3 5 5 5 10 0 4-3 8-5 10H-6c-2-2-5-6-5-10 0-5 7-7 5-10Z" />
  if (skin.id.startsWith('peasant')) return <><path d="M0-13v26" fill="none" stroke="currentColor" strokeWidth="1.8" /><path d="M0-6c-6 0-9-5-8-8 5 0 8 3 8 8Zm1 7c0-6 4-9 8-9 1 4-3 9-8 9Zm-1 5c-6 0-9-4-9-8 5 0 9 3 9 8Zm1 6c0-5 4-8 8-8 0 5-3 8-8 8Z" /></>
  if (skin.id === 'cossack-male') return <><path d="m-10-11 19 22M10-11-9 11" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /><path d="m-12 5 6 6m12 0 6-6" stroke="currentColor" strokeWidth="2" /></>
  return <>{Array.from({ length: 6 }, (_, index) => <ellipse key={index} cx="0" cy="-7" rx="3" ry="5" transform={`rotate(${index * 60})`} />)}<circle r="2.5" /></>
}

// Share paint servers across equal cards so zooming does not rasterize the same
// portrait and ornament separately for every relative.
export const PortraitCardDefinitions = memo(function PortraitCardDefinitions({ skins, metrics: m, artworkId }: {
  skins: PersonCardSkin[]; metrics: PortraitCardMetrics; artworkId: string
}) {
  return <>
    {[...new Map(skins.map(skin => [skin.id, skin])).values()].map(skin => {
      if (!skin.portrait || !m.portraitSize) return null
      const radius = skin.portrait.radius ?? 100
      return <pattern key={skin.id} id={`${artworkId}-portrait-${skin.id}`} x={(m.width - m.portraitSize) / 2} y={m.portraitTop}
        width={m.portraitSize} height={m.portraitSize} patternUnits="userSpaceOnUse"
        viewBox={`${skin.portrait.x - radius} ${skin.portrait.y - radius} ${radius * 2} ${radius * 2}`}>
        <use href={`#${artworkId}${skin.portrait.artwork ? `-${skin.portrait.artwork}` : ''}`} />
      </pattern>
    })}
    {[...new Set(skins.map(skin => skin.tone))].map(tone =>
      <pattern key={tone} id={`${artworkId}-stitch-${tone}`} className={styles.art} data-tone={tone}
        width="14" height="24" patternUnits="userSpaceOnUse">
        <g transform="translate(7 12) scale(.58)" fill="currentColor">
          <path d="M0-7 7 0 0 7-7 0Zm0 3L-4 0l4 4 4-4Z" fillRule="evenodd" />
          <path d="m0-12 2 2-2 2-2-2Zm0 20 2 2-2 2-2-2Zm-10-10 2 2-2 2-2-2Zm20 0 2 2-2 2-2-2Z" />
        </g>
      </pattern>)}
  </>
})

export const PortraitPersonCard = memo(function PortraitPersonCard({ x, y, name, years, skin, metrics: m, artworkId, measureName, measureYears, scale = 1, photoPath }: {
  x: number; y: number; name: string; years: string; skin: PersonCardSkin; metrics: PortraitCardMetrics
  artworkId: string; measureName: (text: string) => number; measureYears: (text: string) => number
  scale?: number; photoPath?: string
}) {
  const id = useId().replaceAll(':', '')
  const left = x - m.width * scale / 2, top = y - m.height * scale / 2
  const { nameTop, yearsTop, roleTop, nameSize, yearSize, roleSize } = m.typography
  const names = portraitTextLines(name, m.textWidth, text => measureName(text) * nameSize / 24, true)
  const dates = portraitTextLines(years, m.textWidth, text => measureYears(text) * yearSize / 15)
  return <>
    <rect className={styles.frame} data-tone={skin.tone} x={left} y={top} width={m.width * scale} height={m.height * scale} rx={12 * scale} />
    <g className={styles.art} data-tone={skin.tone} transform={`translate(${left} ${top}) scale(${scale})`} pointerEvents="none" aria-hidden="true">
      <defs>
        {photoPath && m.portraitSize > 0 && <clipPath id={`${id}-photo`}><circle cx={m.width / 2}
          cy={m.portraitTop + m.portraitSize / 2} r={m.portraitSize / 2} /></clipPath>}
      </defs>
      {[portraitOrnamentInset, m.width - portraitOrnamentInset].map(edge => <rect key={edge} className={styles.ornament}
        transform={`translate(${edge - 7} 12)`} width="14" height={Math.floor((m.height - 28) / 24) * 24}
        fill={`url(#${artworkId}-stitch-${skin.tone})`} />)}
      {m.portraitSize > 0 && <><circle className={styles.ring} cx={m.width / 2} cy={m.portraitTop + m.portraitSize / 2} r={m.portraitSize / 2 + 3} />
      {photoPath ? <image data-card-portrait="true" href={`${import.meta.env.BASE_URL}${photoPath}`}
        x={(m.width - m.portraitSize) / 2} y={m.portraitTop} width={m.portraitSize} height={m.portraitSize}
        preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id}-photo)`} />
        : skin.portrait ? <circle data-card-portrait="true" cx={m.width / 2} cy={m.portraitTop + m.portraitSize / 2}
        r={m.portraitSize / 2} fill={`url(#${artworkId}-portrait-${skin.id})`} />
        : <g className={styles.silhouette} transform={`translate(${m.width / 2} ${m.portraitTop + m.portraitSize / 2}) scale(${m.portraitSize / 100})`}>
          <circle r="49" className={styles.emptyPortrait} /><circle cy="-10" r="15" /><path d="M-30 35v-6a30 22 0 0 1 60 0v6Z" />
        </g>}</>}
      <circle className={styles.badge} cx={m.width / 2} cy={m.badgeY} r={m.badgeRadius} />
      <g className={styles.symbol} transform={`translate(${m.width / 2} ${m.badgeY}) scale(${m.badgeRadius / 23})`}><RoleSymbol skin={skin} /></g>
      <text className={styles.role} data-card-role="true" x={m.width / 2} y={roleTop + roleSize * .85} fontSize={roleSize} textAnchor="middle">{skin.label}</text>
      {names.map((line, index) => <text key={index} className={styles.name} data-card-name="true" x={m.width / 2}
        y={nameTop + nameSize * (.85 + index * 1.1)} fontSize={nameSize} textAnchor="middle">{line}</text>)}
      {dates.map((line, index) => <text key={index} className={styles.years} data-card-years="true" x={m.width / 2}
        y={yearsTop + yearSize * (.85 + index * 1.1)} fontSize={yearSize} textAnchor="middle">{line}</text>)}
    </g>
  </>
})
