const visualProperties = [
  'color', 'font-family', 'font-size', 'font-style', 'font-weight', 'letter-spacing',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'stroke-miterlimit', 'stroke-opacity', 'stroke-width', 'opacity',
  'paint-order', 'text-anchor', 'dominant-baseline', 'visibility',
]

function inlineVisualStyles(source: SVGSVGElement): SVGSVGElement {
  const copy = source.cloneNode(true) as SVGSVGElement
  const sourceElements = [source, ...source.querySelectorAll<SVGElement>('*')]
  const copyElements = [copy, ...copy.querySelectorAll<SVGElement>('*')]

  sourceElements.forEach((element, index) => {
    const target = copyElements[index]
    if (!target) return
    const style = getComputedStyle(element)
    const declarations = visualProperties.map((property) => `${property}:${style.getPropertyValue(property)}`).join(';')
    target.setAttribute('style', `${target.getAttribute('style') ?? ''};${declarations}`)
  })

  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  return copy
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

export async function downloadSvgAsPng(svg: SVGSVGElement, fileName: string, pixelsPerUnit = 3) {
  // Bounds in drawing coordinates include sectors outside the screen and ignore
  // the parent camera's pan/zoom. Change only the exported copy, not the live map.
  const drawing = svg.querySelector<SVGGElement>('[data-layer="coordinates"]')
  if (!drawing) throw new Error('SVG has no diagram')
  const bounds = drawing.getBBox()
  if (!bounds.width || !bounds.height) throw new Error('SVG has no dimensions')
  const padding = 24
  const width = bounds.width + padding * 2
  const height = bounds.height + padding * 2
  const copy = inlineVisualStyles(svg)
  copy.querySelector('[data-layer="camera"]')?.removeAttribute('transform')
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
