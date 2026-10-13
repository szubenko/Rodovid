import { useLayoutEffect, useState, type RefObject } from 'react'

/** Size the drawing window from CSS pixels available in the browser, rather
 * than a monitor's physical resolution. Keep its size stable while scrolling. */
export function useMapViewport(container: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 320, height: 320 })
  useLayoutEffect(() => {
    const element = container.current!
    const measure = () => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      const borderX = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)
      const borderY = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
      const width = Math.max(160, Math.min(10000, box.width - borderX))
      const screenHeight = window.visualViewport?.height ?? window.innerHeight
      const bottomGap = window.innerWidth <= 760 ? 8 : 24
      const expanded = element.closest('[data-map-expanded="true"]')
      const room = screenHeight - (box.top + (expanded ? 0 : window.scrollY)) - borderY
      const available = room - bottomGap
      // On very short screens the page header can consume the entire viewport;
      // the drawing window still fits when the user scrolls down to it.
      const height = Math.max(160, Math.min(Math.max(160, screenHeight - 32),
        room >= 160 ? Math.max(160, available) : Math.max(160, screenHeight - 32)))
      element.style.height = `${height + borderY}px`
      setSize(previous => previous.width === width && previous.height === height ? previous : { width, height })
    }
    const observer = new ResizeObserver(measure)
    const main = element.closest('main')
    const observed = new Set<Element>([element, element.parentElement!, ...main?.children ?? [],
      ...main?.parentElement?.children ?? []])
    observed.forEach(node => observer.observe(node))
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [container])
  return size
}
