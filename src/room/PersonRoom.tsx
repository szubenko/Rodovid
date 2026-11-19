import styles from './Room.module.css'
import { LifeBiography } from './LifeBiography'
import { RelativeDoors } from './RelativeDoors'
import { Memories } from './Memories'
import { PhotoGallery } from './PhotoGallery'
import { Places } from './Places'

export function PersonRoom({ personId, showBiographyHeader = true }: {
  personId: string; showBiographyHeader?: boolean
}) {
  return <article className={styles.room} aria-label="Відомості про людину">
    <LifeBiography personId={personId} showHeader={showBiographyHeader} />
    <div className={styles.grid}>
      <Memories personId={personId} />
      <PhotoGallery personId={personId} />
      <Places personId={personId} />
      <RelativeDoors personId={personId} />
    </div>
  </article>
}
