'use client'

import { useEffect } from 'react'

// App-wide scroll reveal: any element with the `reveal` class fades/slides in
// the first time it scrolls into view (styles in globals.css). One observer
// for the whole app; a MutationObserver picks up elements React adds later
// (infinite scroll, route changes). Elements already on screen when they
// appear are revealed right away, staggered slightly, so nothing blinks.
export default function ScrollReveal() {
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const root = document.documentElement

    const reveal = (els: Element[]) => {
      els
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .forEach((el, i) => {
          ;(el as HTMLElement).style.setProperty('--reveal-delay', `${Math.min(i, 8) * 45}ms`)
          ;(el as HTMLElement).dataset.revealed = '1'
        })
    }

    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).map((e) => e.target)
      visible.forEach((el) => io.unobserve(el))
      if (visible.length) reveal(visible)
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 })

    const track = (scope: ParentNode) => {
      const found = Array.from(scope.querySelectorAll('.reveal:not([data-revealed])'))
      if (scope instanceof Element && scope.matches('.reveal:not([data-revealed])')) found.push(scope)
      if (!found.length) return
      // Reveal anything already in the viewport synchronously (no flash),
      // observe the rest.
      const vh = window.innerHeight
      const onScreen: Element[] = []
      for (const el of found) {
        const r = el.getBoundingClientRect()
        if (r.top < vh && r.bottom > 0) onScreen.push(el)
        else io.observe(el)
      }
      if (onScreen.length) reveal(onScreen)
    }

    track(document)
    root.classList.add('js-reveal')

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) m.addedNodes.forEach((n) => { if (n instanceof Element) track(n) })
    })
    mo.observe(document.body, { childList: true, subtree: true })

    return () => { io.disconnect(); mo.disconnect(); root.classList.remove('js-reveal') }
  }, [])

  return null
}
