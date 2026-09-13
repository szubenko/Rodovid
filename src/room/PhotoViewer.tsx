import { useEffect, useRef, useState } from 'react'
import type PhotoSwipe from 'photoswipe'
import type { Media } from '../data/schema'
import 'photoswipe/style.css'
import './photo-viewer.css'

export function PhotoViewer({ items, index, onClose }: { items: Media[]; index: number; onClose: () => void }) {
  const close = useRef(onClose)
  const [error, setError] = useState(false)
  useEffect(() => {
    let disposed = false
    let viewer: PhotoSwipe | undefined
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    void import('photoswipe').then(({ default: PhotoSwipe }) => {
      if (disposed) return
      viewer = new PhotoSwipe({ index, dataSource: items.map(item => ({ src: `/${item.path}`, width: item.dimensions!.width, height: item.dimensions!.height, alt: item.title })),
        showHideAnimationType: 'none',
        closeTitle: 'Закрити галерею', zoomTitle: 'Збільшити / зменшити', arrowPrevTitle: 'Попереднє фото', arrowNextTitle: 'Наступне фото',
        errorMsg: 'Зображення недоступне. Закрийте галерею або перейдіть до іншого фото.',
        preload: [0, 1], padding: { top: 60, bottom: 110, left: 10, right: 10 },
      })
      viewer.on('uiRegister', () => viewer?.ui?.registerElement({ name: 'caption', order: 9, isButton: false, appendTo: 'root', onInit: element => {
        const update = () => { const item = items[viewer!.currIndex]!; element.textContent = `${item.title}${item.description ? ` — ${item.description}` : ''}` }
        viewer!.on('change', update)
        update()
      } }))
      viewer.on('destroy', () => { if (!disposed) { close.current(); trigger?.focus({ preventScroll: true }) } })
      viewer.on('openingAnimationEnd', () => { if (viewer?.element) viewer.element.dataset.ready = 'true' })
      viewer.init()
      viewer.element?.setAttribute('aria-label', 'Перегляд зображень')
    }).catch(() => { if (!disposed) setError(true) })
    return () => { disposed = true; viewer?.destroy(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [items, index])
  return error ? <p role="alert">Не вдалося відкрити галерею. Скористайтеся прямим посиланням на файл. <button onClick={onClose}>Закрити повідомлення</button></p> : null
}
