import type { EvidenceLink, FamilyEvent, Media, Relationship } from '../data/schema'
import { useFamily } from '../navigation/context'
import { SourceCard } from './Archive'
import { MediaFiles } from './MediaFiles'
import { eventClaims } from './biography'
import { recordDescription, recordUrl } from './source-record'
import styles from './Room.module.css'

export function EvidenceForTarget({ target }: { target: EvidenceLink['target'] }) {
  const family = useFamily()
  const links = family.evidenceLinks.filter(link => link.target.kind === target.kind && link.target.id === target.id)
  const sources = family.sources.filter(source => links.some(link => link.sourceId === source.id))
  return <div data-evidence-target={target.id}>
    {sources.length ? sources.map(source => <SourceCard key={source.id} source={source} links={links.filter(link => link.sourceId === source.id)} />)
      : <p className={styles.empty}>Доказів для цього {target.kind === 'relationship' ? 'зв’язку' : 'твердження або запису'} поки немає.</p>}
  </div>
}

function SourceMedia({ items, links }: { items: Media[]; links: EvidenceLink[] }) {
  return <>
    {items.filter(item => item.mimeType.startsWith('image/')).map(item => <figure key={item.id} className={styles.sourceScan} data-media-id={item.id}>
      <a href={`${import.meta.env.BASE_URL}${item.path}`} target="_blank" rel="noopener noreferrer" aria-label={`Відкрити скан: ${item.title}`}>
        <img src={`${import.meta.env.BASE_URL}${item.path}`} alt={item.title} width={item.dimensions?.width} height={item.dimensions?.height} loading="lazy" />
      </a>
    </figure>)}
    {items.filter(item => item.mimeType === 'application/pdf').map(item =>
      <MediaFiles key={item.id} items={[item]} initialPage={links.find(link => link.fragment?.mediaId === item.id)?.fragment?.page} />
    )}
    {items.filter(item => !item.mimeType.startsWith('image/') && item.mimeType !== 'application/pdf').map(item =>
      <p key={item.id} data-media-id={item.id}><a href={`${import.meta.env.BASE_URL}${item.path}`} target="_blank" rel="noopener noreferrer">Відкрити файл: {item.title}</a></p>
    )}
  </>
}

function SourceDocuments({ links, mediaIds }: { links: EvidenceLink[]; mediaIds: string[] }) {
  const family = useFamily()
  const sources = family.sources.filter(source => links.some(link => link.sourceId === source.id))
  const sourceMediaIds = new Set([...sources.flatMap(source => source.mediaIds), ...links.flatMap(link => link.fragment?.mediaId ? [link.fragment.mediaId] : [])])
  const directMedia = family.media.filter(item => mediaIds.includes(item.id) && !sourceMediaIds.has(item.id))
  return <div>
    {sources.map(source => {
      const citations = links.filter(link => link.sourceId === source.id)
      const mediaIds = new Set([...source.mediaIds, ...citations.flatMap(link => link.fragment?.mediaId ? [link.fragment.mediaId] : [])])
      const media = family.media.filter(item => mediaIds.has(item.id))
      const url = recordUrl(source, citations)
      const description = recordDescription(source.description)
      const hasText = Boolean(description || citations.some(link => link.transcription || recordDescription(link.explanation)))
      return <article key={source.id} className={styles.source} data-source-id={source.id} aria-label={source.title}>
        <dl className={`${styles.biographyRecordFields} ${styles.sourceFacts}`}>
          <div><dt>Зовнішнє посилання:</dt><dd>{url
            ? <a href={url} target="_blank" rel="noopener noreferrer">{url}</a> : 'Не додано'}</dd></div>
        </dl>
        {source.archive && <p>Архів: {source.archive}</p>}
        {source.reference && <p>Шифр: {source.reference}</p>}
        <p className={styles.sourceHeading}>Опис</p>
        {description && <p className={styles.sourceText}>{description}</p>}
        {!hasText && <p className={styles.empty}>Текст запису ще не додано.</p>}
        {citations.map(link => {
          return <div key={link.id} data-evidence-id={link.id} data-source-target-kind={link.target.kind} data-source-target-id={link.target.id}>
            {link.fragment && (link.fragment.page || link.fragment.frame || link.fragment.folio || link.fragment.recordNumber) && <dl className={styles.biographyRecordFields}>
              {link.fragment.page && <div><dt>Сторінка:</dt><dd>{link.fragment.page}</dd></div>}
              {link.fragment.frame && <div><dt>Кадр:</dt><dd>{link.fragment.frame}</dd></div>}
              {link.fragment.folio && <div><dt>Аркуш:</dt><dd>{link.fragment.folio}</dd></div>}
              {link.fragment.recordNumber && <div><dt>Номер запису:</dt><dd>{link.fragment.recordNumber}</dd></div>}
            </dl>}
            {recordDescription(link.explanation) && <p className={styles.sourceText}>{recordDescription(link.explanation)}</p>}
            {link.transcription && <blockquote className={styles.transcription}>{link.transcription}</blockquote>}
          </div>
        })}
        {media.some(item => item.mimeType.startsWith('image/') || item.mimeType === 'application/pdf')
          ? <SourceMedia items={media} links={citations} /> : <>
            <p className={styles.empty}>Скриншот запису ще не додано.</p>
            <SourceMedia items={media} links={citations} />
          </>}
      </article>
    })}
    <SourceMedia items={directMedia} links={[]} />
  </div>
}

export function BiographySource({ event, relationship }: { event: FamilyEvent | null; relationship: Relationship | null }) {
  const family = useFamily()
  const claimIds = new Set(event ? eventClaims(family, event.id).map(claim => claim.id) : [])
  const relationIds = new Set([...(event?.relationshipIds ?? []), ...(relationship ? [relationship.id] : [])])
  const links = family.evidenceLinks.filter(link => link.target.kind === 'event' && link.target.id === event?.id
    || link.target.kind === 'claim' && claimIds.has(link.target.id)
    || link.target.kind === 'relationship' && relationIds.has(link.target.id))
  if (links.length === 0 && !event?.mediaIds.length) return null
  return <details className={styles.biographyDetails} data-source-for={event?.id ?? relationship?.id}>
    <summary>Джерело</summary>
    <SourceDocuments links={links} mediaIds={event?.mediaIds ?? []} />
  </details>
}
