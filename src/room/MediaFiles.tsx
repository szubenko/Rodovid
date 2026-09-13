import { lazy, Suspense, useState } from 'react'
import type { Media } from '../data/schema'
import { ImageGallery } from './PhotoGallery'
import { Modal } from './Modal'
import styles from './Room.module.css'

const PdfViewer = lazy(() => import('./PdfViewer'))
export function MediaFiles({ items, initialPage }: { items: Media[]; initialPage?: number }) {
  const [pdf, setPdf] = useState<Media | null>(null)
  return <div className={styles.mediaFiles}>
    <ImageGallery items={items.filter(m => m.mimeType.startsWith('image/'))} />
    {items.filter(m => m.mimeType === 'application/pdf').map(media => <div key={media.id} data-media-id={media.id}>
      <p><button onClick={() => setPdf(media)}>Відкрити PDF: {media.title}{initialPage ? ` · сторінка ${initialPage}` : ''}</button></p>
      {media.description && <p>{media.description}</p>}
      <p><a href={`/${media.path}`} target="_blank" rel="noopener noreferrer">Прямий файл: {media.title}</a></p>
    </div>)}
    {pdf && <Modal title={pdf.title} onClose={() => setPdf(null)}>
      <p><a href={`/${pdf.path}`} target="_blank" rel="noopener noreferrer">Прямий файл: {pdf.title}</a></p>
      <Suspense fallback={<p role="status">Відкриваємо переглядач…</p>}><PdfViewer path={pdf.path} initialPage={initialPage} /></Suspense>
    </Modal>}
  </div>
}
