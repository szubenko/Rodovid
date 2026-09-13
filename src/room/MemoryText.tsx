import Markdown from 'react-markdown'

export default function MemoryText({ markdown }: { markdown: string }) {
  return <Markdown skipHtml allowedElements={['p', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'blockquote', 'br', 'hr', 'pre', 'code', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']}
    components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>, h1: ({ children }) => <h4>{children}</h4>, h2: ({ children }) => <h4>{children}</h4>, h3: ({ children }) => <h4>{children}</h4> }}>
    {markdown}
  </Markdown>
}
