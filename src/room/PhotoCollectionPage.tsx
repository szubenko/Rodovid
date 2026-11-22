import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useFamily } from '../navigation/context'
import type { Media } from '../data/schema'
import { collectFamilyPhotos, photoCollectionCaption } from './photo-collection'
import { photoPersonMentionMatcher } from './photo-person-mentions'
import { AlbumIcon } from './PhotoDecoration'
import { AtlasNavigation } from '../edition/AtlasNavigation'
import styles from './PhotoCollectionPage.module.css'

function CollectionImage({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false)
  return <div className={styles.image}>{failed ? <p>Фотографія недоступна</p> : <img src={`/${media.path}`} alt={media.title} width={media.dimensions?.width} height={media.dimensions?.height} loading="lazy" onError={() => setFailed(true)} />}</div>
}

export function PhotoCollectionPage({ showAtlasNavigation = false }: { showAtlasNavigation?: boolean }) {
  const family = useFamily()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const branch = params.get('branch') === 'zubenko' ? 'zubenko' : 'kernytski'
  const heading = useRef<HTMLHeadingElement>(null)
  const photos = branch === 'kernytski' ? collectFamilyPhotos(family) : []
  const matchNames = useMemo(() => photoPersonMentionMatcher(family), [family])
  const captionText = (text: string) => matchNames(text).map((part, index) => part.personId
    ? <Link key={index} className={styles.titleLink} to={`/person/${part.personId}`}>{part.text}</Link>
    : part.text)
  const returnTo: unknown = (location.state as { returnTo?: unknown } | null)?.returnTo
  const fromMemories = typeof returnTo === 'string' && /^\/memories(?:\?[^#]*)?$/.test(returnTo)
  const hasReturn = typeof returnTo === 'string' && (fromMemories || (/^\/(?:person|tree|horizontal|vertical|vertical-design|isi-relatives|vertical-minimal|relatives|relatives-2)\/I\d+$/.test(returnTo) && family.people.some(person => person.id === returnTo.split('/').at(-1))))
  useEffect(() => {
    document.title = `Фотогалерея — ${family.config.title}`
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [family.config.title])
  return <section className={`${styles.page} ${showAtlasNavigation ? styles.atlasPage : ''}`} aria-labelledby="photo-collection-title">
    <header className={styles.header}>
      <div className={styles.headingGroup}>
        <h1 id="photo-collection-title" ref={heading} tabIndex={-1}><AlbumIcon kind="camera" />Фотогалерея</h1>
        <label className={styles.branch}><span>Родина</span><select value={branch} onChange={event => {
          setParams({ branch: event.target.value }, { state: location.state })
        }}>
          <option value="kernytski">Стара Сіль</option><option value="zubenko">Чапліївка</option>
        </select></label>
      </div>
      {showAtlasNavigation ? <AtlasNavigation /> : <Link className={styles.back} to={hasReturn ? returnTo : `/tree/${family.config.homePersonId}`} state={fromMemories ? (location.state as { returnState?: unknown } | null)?.returnState : undefined}>{hasReturn ? fromMemories ? '← Повернутися до спогадів' : returnTo.startsWith('/person/') ? '← Повернутися до людини' : '← Повернутися до родоводу' : '← До родоводу'}</Link>}
    </header>
    {photos.length === 0 ? <p className={styles.empty}>Фотографій поки немає.</p> : <div className={styles.grid}>
      {photos.map(photo => {
        const { title, dates, descriptions } = photoCollectionCaption(photo)
        return <figure className={styles.card} key={photo.media.id} data-photo-id={photo.media.id}>
          <CollectionImage media={photo.media} />
          <figcaption>
            {dates.map(date => <p className={styles.date} data-photo-date key={date}><AlbumIcon kind="calendar" />{date}</p>)}
            <h2>{captionText(title)}</h2>
            {descriptions.map(description => <p className={styles.description} key={description}>{captionText(description)}</p>)}
          </figcaption>
        </figure>
      })}
    </div>}
  </section>
}
