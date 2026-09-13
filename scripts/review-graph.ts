// Local geometry inspection only. No application route or publishable asset is added.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { familyDataSchema } from '../src/data/schema.ts'
import { buildFamilyGraph, projectFamily } from '../src/graph/projection.ts'
import { layoutRadial, radialPoint } from '../src/graph/layout.ts'
import type { Point } from '../src/graph/layout.ts'

const root = new URL('../', import.meta.url)
const family = familyDataSchema.parse(JSON.parse(await readFile(new URL('generated/family.json', root), 'utf8')))
const graph = buildFamilyGraph(family)
const labels = new Map(family.people.map((person) => {
  const names = family.claims.filter((claim) => claim.field === 'name' && claim.target.id === person.id)
  const name = names.find((claim) => claim.isPrimary) ?? names[0]
  return [person.id, name?.field === 'name' ? name.value.display : 'Ім’я невідоме']
}))
const directory = new URL('tmp/rod010/', root)
await mkdir(directory, { recursive: true })
const escape = (text: string) => text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const point = (value: Point) => `${value.x},${value.y}`
const browser = await chromium.launch()
const results = []
try {
  for (const width of [320, 1024]) for (const [personId, generations] of [['I1', 3], ['I9', 3], ['I20', 4]] as const) {
    const projection = projectFamily(graph, personId, { generations })
    const layout = layoutRadial(projection, { width, height: width, labels })
    let shapes = ''
    let texts = ''
    for (const [index, node] of layout.nodes.entries()) {
      if (node.ring === 0) {
        shapes += `<circle cx="${node.x}" cy="${node.y}" r="${layout.centerRadius}" fill="#f5e6c9" stroke="#b89d74"/>`
        texts += node.centerLines.map((line, lineIndex) => `<text data-width="${node.labelWidth}" x="${node.x}" y="${node.y + (lineIndex - (node.centerLines.length - 1) / 2) * 18}" text-anchor="middle" dominant-baseline="middle">${escape(line)}</text>`).join('')
        continue
      }
      const { innerRadius: inner, outerRadius: outer, startAngle: a, endAngle: b } = node
      const p = (r: number, angle: number) => point(radialPoint(layout.center, r, angle))
      const large = b - a > 180 ? 1 : 0
      const path = `M${p(outer, a)} A${outer},${outer} 0 ${large} 1 ${p(outer, b)} L${p(inner, b)} A${inner},${inner} 0 ${large} 0 ${p(inner, a)} Z`
      const warning = graph.relationships.get(node.relationshipId!)?.explanation
      shapes += `<path d="${path}" fill="${node.lane === 'parents' ? '#eedabc' : '#e6d8c3'}" stroke="${warning ? '#9c493a' : '#aa9476'}" ${warning ? 'stroke-dasharray="4 3"' : ''}><title>${escape(node.fullLabel)}${warning ? ` — ${escape(warning)}` : ''}</title></path>`
      const r = node.labelRadius
      const arc = `M${p(r, node.reverseLabel ? b : a)} A${r},${r} 0 ${large} ${node.reverseLabel ? 0 : 1} ${p(r, node.reverseLabel ? a : b)}`
      texts += `<defs><path id="label-${index}" d="${arc}"/></defs><text data-width="${node.labelWidth}"><textPath href="#label-${index}" startOffset="50%" text-anchor="middle">${escape(node.label)}</textPath></text>`
    }
    const html = `<!doctype html><html lang="uk"><meta charset="utf-8"><title>ROD-010 — геометрія</title><style>*{box-sizing:border-box}body{margin:0;background:#f7efdf;color:#493825;font:14px Georgia,serif}header,section{padding:16px}h1{font-size:20px;margin:0 0 8px}svg{display:block;width:100%}text{font:${layout.nodes[0]!.fontSize}px Georgia,serif;fill:#493825}li{margin:6px 0;overflow-wrap:anywhere}</style><header><h1>${escape(labels.get(personId) ?? personId)}</h1>${generations} покоління · ${width} px · перевірка геометрії</header><svg viewBox="0 0 ${width} ${width}">${shapes}${texts}</svg><section>Повні імена видимих людей:<ul>${[...new Set(layout.nodes.map((node) => node.personId))].map((id) => `<li>${escape(labels.get(id) ?? id)}</li>`).join('')}</ul></section></html>`
    const name = `${personId}-${generations}-${width}`
    await writeFile(new URL(`${name}.html`, directory), html)
    const page = await browser.newPage({ viewport: { width, height: width + 260 } })
    await page.setContent(html)
    await page.evaluate(() => document.fonts.ready)
    const overflow = await page.locator('text[data-width]').evaluateAll((elements) => elements.filter((element) =>
      (element as SVGTextElement).getComputedTextLength() > Number(element.getAttribute('data-width')) + 0.5).length)
    if (overflow) throw new Error(`Text exceeds allotted geometry: ${name}`)
    await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, directory)), fullPage: true })
    results.push({ personId, generations, width, appearances: layout.nodes.length, truncatedLabels: layout.nodes.filter((node) => node.labelTruncated).length, overflowingLabels: overflow })
    await page.close()
  }
  await writeFile(new URL('report.json', directory), JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
