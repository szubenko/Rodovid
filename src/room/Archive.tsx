import type { EvidenceLink, Source } from '../data/schema'
import { useFamily } from '../navigation/context'
import { claimText, eventLabels } from './biography'
import { personName } from '../data/person-name'
import { relationshipName } from '../graph/presentation'
import { MediaFiles } from './MediaFiles'
import styles from './Room.module.css'

export function SourceCard({ source, links }: { source: Source; links: EvidenceLink[] }) {
  const family = useFamily()
  const mediaIds = new Set([...source.mediaIds, ...links.flatMap(link => link.fragment?.mediaId ? [link.fragment.mediaId] : [])])
  return <article className={styles.source} data-source-id={source.id}>
    <h3>{source.title}</h3>
    {source.description && <p>{source.description}</p>}
    {source.archive && <p>Архів: {source.archive}</p>}
    {source.reference && <p>Шифр: {source.reference}</p>}
    {source.addedOn && <p>Додано: {source.addedOn}</p>}
    {source.url && <p><a href={source.url} target="_blank" rel="noopener noreferrer">Перейти до джерела: {source.title}</a></p>}
    <MediaFiles items={family.media.filter(m => mediaIds.has(m.id))} />
    {links.map(link => {
      const claim = family.claims.find(c => c.id === link.target.id)
      const event = family.events.find(e => e.id === link.target.id)
      const relation = family.relationships.find(r => r.id === link.target.id)
      const label = link.target.kind === 'person' ? personName(family, link.target.id) : claim ? claimText(family, claim) : event ? event.label ?? eventLabels[event.kind] : relation ? relationshipName(family, relation) : ''
      const media = family.media.find(m => m.id === link.fragment?.mediaId)
      const region = link.fragment?.region
      return <details key={link.id} data-evidence-id={link.id}>
      <summary>Прив’язка до {({ person: 'людини', event: 'події', claim: 'твердження', relationship: 'зв’язку' })[link.target.kind]}: {label}</summary>
      {link.fragment?.page && <p>Сторінка: {link.fragment.page}</p>}
      {link.fragment?.frame && <p>Кадр: {link.fragment.frame}</p>}
      {link.fragment?.folio && <p>Аркуш: {link.fragment.folio}</p>}
      {link.fragment?.recordNumber && <p>Номер запису: {link.fragment.recordNumber}</p>}
      {link.explanation && <p>{link.explanation}</p>}
      {link.transcription && link.transcription !== source.description && <blockquote className={styles.transcription}>{link.transcription}</blockquote>}
      {region && media?.dimensions && media.mimeType.startsWith('image/') && <figure className={styles.fragment}>
        <div style={{ aspectRatio: `${media.dimensions.width * region.width} / ${media.dimensions.height * region.height}` }}>
          <img src={`/${media.thumbnail?.path ?? media.path}`} alt="Виділений фрагмент запису" loading="lazy" style={{ width: `${100 / region.width}%`, left: `${-100 * region.x / region.width}%`, top: `${-100 * region.y / region.height}%` }} />
        </div><figcaption>Виділений фрагмент запису</figcaption>
      </figure>}
      {link.fragment?.mediaId && <MediaFiles items={family.media.filter(m => m.id === link.fragment!.mediaId)} initialPage={link.fragment.page} />}
    </details>})}
  </article>
}
