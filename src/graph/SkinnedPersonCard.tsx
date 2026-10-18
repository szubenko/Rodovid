import { useId } from 'react'
import reference from '../appearance/skins/stylepicture.png?no-inline'
import type { PersonCardSkin } from './person-card-skin'
import { nameLines } from './text-block'
import styles from './SkinnedPersonCard.module.css'

// One raster per diagram, including the exported SVG. Each portrait references it.
export function PersonCardArtwork({ id }: { id: string }) {
  return <image id={id} data-card-artwork="true" href={reference} width="1672" height="941" />
}

export function SkinnedPersonCard({ x, y, width: cardWidth, height: cardHeight, name, years, skin, cardClassName, artworkId, measureName, measureYears }: {
  x: number; y: number; width: number; height: number; name: string; years: string
  skin: PersonCardSkin; cardClassName?: string
  artworkId: string; measureName: (text: string) => number; measureYears: (text: string) => number
}) {
  const prefix = useId().replaceAll(':', '')
  const left = x - cardWidth / 2, top = y - cardHeight / 2
  // Scale the complete composition together on smaller lateral cards.
  const scale = Math.min(1, cardWidth / 272, cardHeight / 128)
  const width = cardWidth / scale, height = cardHeight / scale
  const size = Math.min(height - 24, width * 0.34)
  const portraitX = 19 + size / 2, portraitY = height / 2
  const textX = 32 + size, textWidth = width - textX - 23
  const words = name.split(/\s+/u)
  const lines = words.length === 2 ? words : nameLines(name, textWidth, measureName)
  const yearLines = years ? nameLines(years, textWidth, measureYears) : []
  const fontSize = Math.min(yearLines.length > 1 ? 20 : 24, textWidth / Math.max(...lines.map(measureName)) * 24)
  const yearFontSize = Math.min(15, textWidth / Math.max(1, ...yearLines.map(measureYears)) * 15)
  const nameY = yearLines.length > 1 ? height * .40 : years ? height * .48 : height * .54
  const flourish = !years || yearLines.length === 1 && measureYears(years) < textWidth - 50
  return <>
    <rect className={`${cardClassName ?? ''} ${styles.frame}`} data-tone={skin.tone}
      x={left} y={top} width={cardWidth} height={cardHeight} rx="11" />
    <g className={styles.art} data-tone={skin.tone} transform={`translate(${left} ${top}) scale(${scale})`} pointerEvents="none" aria-hidden="true">
      <defs>
        {skin.portrait && <pattern id={`${prefix}-portrait`} x="19" y={(height - size) / 2}
          width={size} height={size} patternUnits="userSpaceOnUse"
          viewBox={`${skin.portrait.x - 100} ${skin.portrait.y - 100} 200 200`}>
          <use href={`#${artworkId}`} />
        </pattern>}
        <g id={`${prefix}-flower`} fill="currentColor">
          <path d="M0-9 3-6 0-3-3-6ZM9 0 6 3 3 0 6-3ZM0 9-3 6 0 3 3 6ZM-9 0-6-3-3 0-6 3Z" />
          <path d="m-6-7 2 1-1 2-2-2Zm12 0 1 1-2 2-1-2ZM6 7 4 6 5 4 7 6ZM-6 7-7 6-5 4-4 6ZM0-2 2 0 0 2-2 0Z" />
        </g>
      </defs>
      {[9, width - 9].map(edge => <g key={edge} className={styles.border}>
        {[22, height / 2, height - 22].map(row => <use key={row} href={`#${prefix}-flower`} transform={`translate(${edge} ${row}) scale(.68)`} />)}
        <path d={`M${edge},9 l3,4 -6,6 6,6 -6,6 3,3 M${edge},${height - 34} l3,3 -6,6 6,6 -6,6 3,4`} />
      </g>)}
      <circle className={styles.portraitRing} cx={portraitX} cy={portraitY} r={size / 2 + 3} />
      {skin.portrait && <circle cx={portraitX} cy={portraitY} r={size / 2} fill={`url(#${prefix}-portrait)`} />}
      <rect className={styles.badge} x={textX - 3} y="14" width={Math.min(textWidth + 4, 120)} height="24" rx="12" />
      <use href={`#${prefix}-flower`} transform={`translate(${textX + 10} 26) scale(.72)`} />
      {lines.map((line, index) => <text key={index} className={styles.name} data-card-name="true"
        x={textX} y={nameY + index * (fontSize + 1)} fontSize={fontSize} dominantBaseline="central">{line}</text>)}
      <text className={styles.badgeLabel} x={textX + 26} y="27" dominantBaseline="central">{skin.label}</text>
      {yearLines.map((line, index) => <text key={index} className={styles.years} data-card-years="true" x={textX}
        y={height - 19 - (yearLines.length - 1 - index) * 16} style={{ fontSize: yearFontSize }} dominantBaseline="central">{line}</text>)}
      {flourish && <><path className={styles.flourish} d={`M${width - 61},${height - 19} h17`} />
        <use href={`#${prefix}-flower`} transform={`translate(${width - 29} ${height - 19}) scale(.9)`} /></>}
    </g>
  </>
}
