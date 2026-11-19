import Markdown, { defaultUrlTransform } from 'react-markdown'
import type { Media } from '../data/schema'

export default function MemoryText({ markdown, media = [] }: { markdown: string; media?: Media[] }) {
  return <Markdown skipHtml allowedElements={['p', 'em', 'strong', 'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'br', 'hr', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']}
    urlTransform={url => url.startsWith('memory:') ? url : defaultUrlTransform(url)}
    components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, img: ({ src, alt }) => {
      const image = media.find(item => `memory:${item.id}` === src && item.mimeType.startsWith('image/'))
      return image ? <img src={`${import.meta.env.BASE_URL}${image.path}`} alt={alt || image.title} width={image.dimensions?.width} height={image.dimensions?.height} loading="lazy" /> : null
    }, h1: ({ children }) => <h4>{children}</h4>, h2: ({ children }) => <h4>{children}</h4>, h3: ({ children }) => <h4>{children}</h4> }}>
    {markdown}
  </Markdown>
}
