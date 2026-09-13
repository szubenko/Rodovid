import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import styles from './Room.module.css'

GlobalWorkerOptions.workerSrc = workerUrl

function PdfPage({ pdf, page, zoom }: { pdf: PDFDocumentProxy; page: number; zoom: number }) {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Завантажуємо сторінку…')
  const [text, setText] = useState('')
  useEffect(() => {
    const element = host.current!
    let generation = 0
    let rendering: RenderTask | undefined
    const draw = async () => {
      const current = ++generation
      rendering?.cancel()
      setStatus('Завантажуємо сторінку…')
      try {
        const sheet = await pdf.getPage(page)
        if (current !== generation) return
        const base = sheet.getViewport({ scale: 1 })
        const fit = Math.max(100, element.clientWidth - 20) / base.width
        const viewport = sheet.getViewport({ scale: fit * zoom })
        const density = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(16_000_000 / (viewport.width * viewport.height)))
        // Each render owns a new canvas; cancelled work cannot paint the next page.
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width * density); canvas.height = Math.floor(viewport.height * density)
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`
        canvas.setAttribute('aria-label', `Сторінка ${page} документа`); canvas.setAttribute('role', 'img')
        element.replaceChildren(canvas)
        const task = sheet.render({ canvas, viewport, transform: [density, 0, 0, density, 0, 0] })
        rendering = task
        const [content] = await Promise.all([sheet.getTextContent(), task.promise])
        if (current === generation) { setText(content.items.flatMap(item => 'str' in item ? [item.str] : []).join(' ')); setStatus(`Сторінка ${page} готова`) }
      } catch { if (current === generation) setStatus('Не вдалося показати сторінку. Відкрийте пряме посилання на файл.') }
    }
    const observer = new ResizeObserver(() => { void draw() })
    observer.observe(element)
    return () => { generation++; rendering?.cancel(); observer.disconnect(); element.replaceChildren() }
  }, [pdf, page, zoom])
  return <><p role="status">{status}</p><div ref={host} className={styles.pdfCanvas} tabIndex={0} aria-label="Область PDF: прокручуйте для перегляду збільшеної сторінки" />
    {text && <details><summary>Текст сторінки</summary><p>{text}</p></details>}</>
}

export default function PdfViewer({ path, initialPage = 1 }: { path: string; initialPage?: number }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [error, setError] = useState(false)
  const [page, setPage] = useState(initialPage)
  const [zoom, setZoom] = useState(1)
  useEffect(() => {
    let active = true
    const loading = getDocument({ url: `/${path}`, useSystemFonts: true,
      cMapUrl: '/app-assets/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/app-assets/pdfjs/standard_fonts/',
      wasmUrl: '/app-assets/pdfjs/wasm/', iccUrl: '/app-assets/pdfjs/iccs/' })
    loading.promise.then(doc => { if (active) { setPdf(doc); setPage(Math.min(initialPage, doc.numPages)) } }, () => { if (active) setError(true) })
    return () => { active = false; void loading.destroy() }
  }, [path, initialPage])
  if (error) return <p role="alert">PDF недоступний або пошкоджений. Спробуйте пряме посилання на файл.</p>
  if (!pdf) return <p role="status">Завантажуємо PDF…</p>
  return <>
    <div className={styles.pdfControls}>
      <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Попередня сторінка</button>
      <span>Сторінка {page} з {pdf.numPages}</span>
      <button disabled={page >= pdf.numPages} onClick={() => setPage(p => p + 1)}>Наступна сторінка</button>
      <label>Масштаб PDF <select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[1, 1.5, 2, 3, 4].map(n => <option key={n} value={n}>{n === 1 ? 'За шириною' : `${n * 100}%`}</option>)}</select></label>
    </div>
    <PdfPage key={page} pdf={pdf} page={page} zoom={zoom} />
  </>
}
