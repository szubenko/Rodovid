import Markdown, { defaultUrlTransform } from 'react-markdown'
import type { Media } from '../data/schema'
import type { Root } from 'mdast'
import type { Processor } from 'unified'

// Recognize only the supported formatting instructions; other HTML stays disabled.
function memoryFormatting(this: Processor) {
  const parse = this.parse.bind(this)
  return (tree: Root) => {
    type Node = { type: string; value?: string; children?: Node[]; data?: Record<string, unknown> }
    function transform(node: Node) {
      const children = node.children
      if (!children) return
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!
        if (child.type === 'html') {
          const centered = /^<p\s+align=["']center["']\s*>([\s\S]*?)<\/p\s*>([\s\S]*)$/i.exec(child.value ?? '')
          if (centered) {
            const content = parse(centered[1]!) as unknown as Node
            const following = parse(centered[2]!) as unknown as Node
            children.splice(i, 1, { type: 'blockquote', children: content.children, data: { hName: 'div' } }, ...(following.children ?? []))
          }
        }
        if (child.type === 'html' && /^<span\s+(?:style=["']color\s*:\s*red\s*;?["']|color=["']red["'])\s*>$/i.test(child.value ?? '')) {
          const end = children.findIndex((item, index) => index > i && item.type === 'html' && /^<\/span\s*>$/i.test(item.value ?? ''))
          if (end !== -1) {
            const content = children.slice(i + 1, end)
            children.splice(i, end - i + 1, { type: 'emphasis', children: content, data: { hName: 'span' } })
          }
        }
        transform(children[i]!)
      }
    }
    transform(tree as unknown as Node)
  }
}

export default function MemoryText({ markdown, media = [] }: { markdown: string; media?: Media[] }) {
  return <Markdown skipHtml remarkPlugins={[memoryFormatting]} allowedElements={['p', 'div', 'em', 'strong', 'span', 'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'br', 'hr', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']}
    urlTransform={url => url.startsWith('memory:') ? url : defaultUrlTransform(url)}
    components={{ div: ({ children }) => <div style={{ textAlign: 'center' }}>{children}</div>, span: ({ children }) => <span style={{ color: 'red' }}>{children}</span>, a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ src, alt }) => {
      const image = media.find(item => `memory:${item.id}` === src && item.mimeType.startsWith('image/'))
      return image ? <img src={`${import.meta.env.BASE_URL}${image.path}`} alt={alt || image.title} width={image.dimensions?.width} height={image.dimensions?.height} loading="lazy" /> : null
    }, h1: ({ children }) => <h4>{children}</h4>, h2: ({ children }) => <h4>{children}</h4>, h3: ({ children }) => <h4>{children}</h4> }}>
    {markdown}
  </Markdown>
}
