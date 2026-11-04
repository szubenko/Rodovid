import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useFamily } from '../navigation/context'
import { personFullName } from '../data/person-name'
import type { Media } from '../data/schema'
import { collectFamilyPhotos } from './photo-collection'
import { AlbumIcon } from './PhotoDecoration'
import styles from './PhotoCollectionPage.module.css'

function CollectionImage({ media }: { media: Media }) {
  const [failed, setFailed] = useState(false)
  return <div className={styles.image}>{failed ? <p>Фотографія недоступна</p> : <img src={`/${media.path}`} alt={media.title} width={media.dimensions?.width} height={media.dimensions?.height} loading="lazy" onError={() => setFailed(true)} />}</div>
}

export function PhotoCollectionPage() {
  const family = useFamily()
  const location = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  const photos = collectFamilyPhotos(family)
  const returnTo: unknown = (location.state as { returnTo?: unknown } | null)?.returnTo
  const hasReturn = typeof returnTo === 'string' && /^\/(?:person|tree|horizontal|vertical|vertical-design|vertical-minimal|relatives)\/I\d+$/.test(returnTo) && family.people.some(person => person.id === returnTo.split('/').at(-1))
  useEffect(() => {
    document.title = `Фотогалерея — ${family.config.title}`
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [family.config.title])
  return <section className={styles.page} aria-labelledby="photo-collection-title">
    <header className={styles.header}>
      <div><p className={styles.kicker}>Сімейний архів</p><h1 id="photo-collection-title" ref={heading} tabIndex={-1}><AlbumIcon kind="camera" />Фотогалерея</h1><p>Усі фотографії родоводу з оригінальними описами · {photos.length}</p></div>
      <Link className={styles.back} to={hasReturn ? returnTo : `/tree/${family.config.homePersonId}`}>{hasReturn ? returnTo.startsWith('/person/') ? '← Повернутися до людини' : '← Повернутися до родоводу' : '← До родоводу'}</Link>
    </header>
    {photos.length === 0 ? <p className={styles.empty}>Фотографій поки немає.</p> : <div className={styles.grid}>
      {photos.map(photo => <figure className={styles.card} key={photo.media.id} data-photo-id={photo.media.id}>
        <CollectionImage media={photo.media} />
        <figcaption><h2><Link className={styles.titleLink} to={`/person/${photo.personIds[0]!}`} title={`Відкрити: ${personFullName(family, photo.personIds[0]!)}`}>{photo.media.title}</Link></h2>
          {photo.descriptions.length ? photo.descriptions.map(description => <p className={styles.description} key={description}>{description}</p>) : <p className={styles.muted}>Опису поки немає.</p>}
        </figcaption>
      </figure>)}
    </div>}
  </section>
}
