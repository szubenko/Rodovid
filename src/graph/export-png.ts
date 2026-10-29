const visualProperties = [
  'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'opacity',
  'paint-order', 'text-anchor', 'dominant-baseline', 'visibility',
]

function snapshotDiagram(source: SVGSVGElement) {
  const copy = source.cloneNode(true) as SVGSVGElement
  copy.querySelector('[data-layer="camera"]')?.removeAttribute('transform')
  copy.querySelector('[data-layer="layout"]')?.removeAttribute('transform')
  copy.querySelectorAll('[data-hit="true"]').forEach(hit => hit.remove())
  // Screen-sized interaction buttons are not part of the exported family tree.
  copy.querySelectorAll('[data-layer="sibling-controls"], [data-layer="ancestor-controls"]').forEach(control => control.remove())
  // Resolve the normal diagram styles on an inert offscreen copy. Hover and
  // focus are transient input feedback; explicit selection stays in the copy.
  copy.setAttribute('inert', '')
  copy.setAttribute('aria-hidden', 'true')
  copy.style.position = 'fixed'
  copy.style.left = '-100000px'
  copy.style.top = '-100000px'
  source.parentElement!.append(copy)
  try {
    const drawing = copy.querySelector<SVGGElement>('[data-layer="coordinates"]')
    if (!drawing) throw new Error('SVG has no diagram')
    const bounds = drawing.getBBox()
    for (const element of [copy, ...copy.querySelectorAll<SVGElement>('*')]) {
      const style = getComputedStyle(element)
      const declarations = visualProperties.map(property => `${property}:${style.getPropertyValue(property)}`).join(';')
      element.setAttribute('style', `${element.getAttribute('style') ?? ''};${declarations}`)
    }
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    return { copy, bounds }
  } finally {
    copy.remove()
    copy.style.removeProperty('position')
    copy.style.removeProperty('left')
    copy.style.removeProperty('top')
    copy.removeAttribute('inert')
    copy.removeAttribute('aria-hidden')
  }
}

function svgImage(svg: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    image.onload = () => { URL.revokeObjectURL(url); resolve(image) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG could not be rendered')) }
    image.src = url
  })
}

function pngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob) resolve(blob)
    else reject(new Error('PNG could not be created'))
  }, 'image/png'))
}

async function embedImages(svg: SVGSVGElement) {
  await Promise.all([...svg.querySelectorAll('image')].map(async image => {
    const href = image.getAttribute('href')
    if (!href || href.startsWith('data:')) return
    const response = await fetch(new URL(href, document.baseURI))
    if (!response.ok) throw new Error('Diagram image could not be loaded')
    const blob = await response.blob()
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Diagram image could not be embedded'))
      reader.readAsDataURL(blob)
    })
    image.setAttribute('href', data)
  }))
}

export async function downloadSvgAsPng(svg: SVGSVGElement, fileName: string, pixelsPerUnit = 3) {
  // Bounds in drawing coordinates include sectors outside the screen and ignore
  // the parent camera's pan/zoom. Change only the exported copy, not the live map.
  const { copy, bounds } = snapshotDiagram(svg)
  await embedImages(copy)
  if (!bounds.width || !bounds.height) throw new Error('SVG has no dimensions')
  const padding = 24
  const width = bounds.width + padding * 2
  const height = bounds.height + padding * 2
  copy.setAttribute('viewBox', `${bounds.x - padding} ${bounds.y - padding} ${width} ${height}`)
  copy.setAttribute('width', String(width))
  copy.setAttribute('height', String(height))

  // Keep labels crisp even in an edition that initially fits the drawing to
  // the screen. Cap both dimensions and area to bound canvas memory usage.
  const scale = Math.min(pixelsPerUnit, 12_000 / Math.max(width, height), Math.sqrt(32_000_000 / (width * height)))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas is unavailable')

  const canvasBackground = getComputedStyle(svg.parentElement ?? svg).backgroundColor
  context.fillStyle = canvasBackground === 'rgba(0, 0, 0, 0)' ? '#dcdede' : canvasBackground
  context.fillRect(0, 0, canvas.width, canvas.height)
  const image = await svgImage(new XMLSerializer().serializeToString(copy))
  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  const url = URL.createObjectURL(await pngBlob(canvas))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
