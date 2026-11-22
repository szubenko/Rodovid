import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useFamily } from '../navigation/context'
import { collectFamilyPhotos, collectUnidentifiedPhotos, photoCollectionCaption, type CollectedPhoto } from './photo-collection'
import { photoPersonMentionMatcher } from './photo-person-mentions'
import styles from './PhotoLightbox.module.css'

export function PhotoLightbox({ photos, index, onClose, initialBranch = 'kernytski', showFilters = true }: { photos: CollectedPhoto[]; index: number; onClose: () => void; initialBranch?: 'kernytski' | 'zubenko'; showFilters?: boolean }) {
  const [current, setCurrent] = useState(index)
  const [branch, setBranch] = useState<'kernytski' | 'zubenko'>(initialBranch)
  const [branchChanged, setBranchChanged] = useState(false)
  const [showUnidentified, setShowUnidentified] = useState(false)
  const [showDescription, setShowDescription] = useState(true)
  const [scale, setScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(0)
  const zoomed = scale > 1
  const dialog = useRef<HTMLDialogElement>(null)
  const imageArea = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const family = useFamily()
  const matchNames = useMemo(() => photoPersonMentionMatcher(family), [family])
  const regularPhotos = branchChanged ? (branch === 'kernytski' ? collectFamilyPhotos(family) : []) : photos
  const unidentifiedPhotos = collectUnidentifiedPhotos(family, branch, regularPhotos)
  const visiblePhotos = showUnidentified ? unidentifiedPhotos : regularPhotos
  const photo = visiblePhotos[current]
  const caption = photo ? photoCollectionCaption(photo) : null
  const linked = (text: string) => matchNames(text).map((part, i) => part.personId ? <Link key={i} to={`/person/${part.personId}`}>{part.text}</Link> : part.text)
  const move = (offset: number) => { setCurrent(value => (value + offset + visiblePhotos.length) % visiblePhotos.length); setScale(1) }
  const measureFitWidth = () => {
    const area = imageArea.current
    const image = area?.querySelector('img')
    if (!area || !image?.naturalWidth || !image.naturalHeight) return 0
    const style = getComputedStyle(area)
    const width = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const height = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    return Math.min(width, height * image.naturalWidth / image.naturalHeight)
  }
  useEffect(() => {
    const element = dialog.current!
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !imageArea.current) return
      event.preventDefault()
      const width = measureFitWidth()
      if (!width || !event.deltaY) return
      setFitWidth(width)
      setScale(value => { const next = Math.min(5, value * Math.exp(-event.deltaY * 0.002)); return next < 1.001 ? 1 : next })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current!
    element.showModal()
    return () => { element.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={dialog} className={styles.dialog} aria-label="Перегляд фотографій" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
    if (event.target instanceof HTMLSelectElement || event.altKey || event.ctrlKey || event.metaKey || visiblePhotos.length < 2) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1) }
  }}>
    <div className={styles.toolbar}>
      <div className={styles.info}><span aria-live="polite">{photo ? `Фото ${current + 1} / ${visiblePhotos.length}` : 'Фото 0 / 0'}</span>
        {showFilters && <label className={styles.branch}>Родина <select value={branch} onChange={event => { setBranch(event.target.value as 'kernytski' | 'zubenko'); setBranchChanged(true); setCurrent(0); setScale(1) }}><option value="kernytski">Стара Сіль</option><option value="zubenko">Чапліївка</option></select></label>}
      </div>
      {showFilters && <label className={styles.unidentified}><input type="checkbox" checked={showUnidentified} onChange={event => { setShowUnidentified(event.target.checked); setCurrent(0); setScale(1) }} />Фото без опису</label>}
      <div className={styles.actions}>
        <button type="button" disabled={!photo} onClick={() => { if (zoomed) setScale(1); else { const width = measureFitWidth(); if (width) { setFitWidth(width); setScale(2) } } }}>{zoomed ? 'За розміром екрана' : 'Збільшити'}</button>
        <button type="button" aria-expanded={showDescription} onClick={() => setShowDescription(value => !value)}>{showDescription ? 'Сховати опис' : 'Показати опис'}</button>
        <button type="button" onClick={onClose} autoFocus aria-label="Закрити перегляд">✕</button>
      </div>
    </div>
    <div className={styles.content}>
      <div className={styles.stage}>
        {photo ? <div ref={imageArea} className={`${styles.imageArea} ${zoomed ? styles.zoomed : ''} ${dragging ? styles.dragging : ''}`} onPointerDown={event => {
          if (!zoomed || event.pointerType !== 'mouse' || event.button !== 0 || event.target !== event.currentTarget.querySelector('img')) return
          const area = event.currentTarget
          drag.current = { x: event.clientX, y: event.clientY, left: area.scrollLeft, top: area.scrollTop }
          area.setPointerCapture(event.pointerId)
          setDragging(true)
          event.preventDefault()
        }} onPointerMove={event => {
          if (!drag.current) return
          event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x)
          event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y)
        }} onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }} onLostPointerCapture={() => { drag.current = null; setDragging(false) }}><img key={photo.media.id} src={`/${photo.media.path}`} alt={photo.media.title} draggable={false} style={zoomed ? { width: fitWidth * scale } : undefined} /></div> : <p className={styles.empty}>Фотографій поки немає.</p>}
        {visiblePhotos.length > 1 && <><button type="button" className={`${styles.arrow} ${styles.previous}`} aria-label="Попереднє фото" onClick={() => move(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg></button><button type="button" className={`${styles.arrow} ${styles.next}`} aria-label="Наступне фото" onClick={() => move(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg></button></>}
      </div>
      {showDescription && caption && <aside className={styles.description} aria-label="Опис фотографії">
        {caption.dates.map(date => <p key={date} className={styles.date}>{date}</p>)}
        <h2>{linked(caption.title)}</h2>
        {showUnidentified && photo && <p className={styles.filename}>Файл: {photo.media.path.split('/').at(-1)}</p>}
        {caption.descriptions.map(description => <p key={description} className={styles.body}>{linked(description)}</p>)}
      </aside>}
    </div>
  </dialog>
}
