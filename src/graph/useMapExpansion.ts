import { useLayoutEffect, useRef, useState, type MouseEvent, type RefObject } from 'react'

/** Expand in the current browser viewport, including embedded browsers that
 * cannot use the browser Fullscreen API. Keep keyboard focus within the map. */
export function useMapExpansion(container: RefObject<HTMLDivElement | null>) {
  const [expanded, setExpanded] = useState(false)
  const opener = useRef<HTMLButtonElement | null>(null)
  useLayoutEffect(() => {
    if (!expanded) { opener.current?.focus({ preventScroll: true }); return }
    const section = container.current!.closest('section')!
    const inert: { element: HTMLElement; previous: boolean }[] = []
    let branch: HTMLElement = section
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue
        inert.push({ element: sibling, previous: sibling.inert })
        sibling.inert = true
      }
      branch = branch.parentElement
      if (branch === document.body) break
    }
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setExpanded(false) }
      if (event.key === 'Tab') {
        const targets = [...section.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')]
          .filter(node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden')
        const first = targets[0], last = targets.at(-1)
        if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus() }
      }
    }
    section.addEventListener('keydown', escape)
    return () => {
      section.removeEventListener('keydown', escape)
      inert.forEach(({ element, previous }) => { element.inert = previous })
      document.body.style.overflow = overflow
    }
  }, [container, expanded])
  return { expanded, toggleExpansion: (event: MouseEvent<HTMLButtonElement>) => {
    if (!expanded) opener.current = event.currentTarget
    setExpanded(value => !value)
  } }
}
