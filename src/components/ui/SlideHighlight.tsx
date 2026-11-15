'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import ui from './ui.module.css'

// The lime pill behind a segmented control's active option, sliding to
// whichever child is marked aria-selected="true" or data-active="true".
// Drop it in as the first child of a `ui.segmented` (+ `ui.segSlide`)
// container; the active button's own background is turned off by segSlide.
// `activeKey` just needs to change when the selection changes.
export default function SlideHighlight({ activeKey, radius }: { activeKey: string; radius?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [animate, setAnimate] = useState(false)

  useLayoutEffect(() => {
    const parent = ref.current?.parentElement
    if (!parent) return
    const measure = () => {
      const el = parent.querySelector<HTMLElement>('[aria-selected="true"], [data-active="true"]')
      if (!el) { setBox(null); return }
      setBox({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(parent)
    // Only animate moves after the first placement.
    const t = requestAnimationFrame(() => setAnimate(true))
    return () => { ro.disconnect(); cancelAnimationFrame(t) }
  }, [activeKey])

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={`${ui.segIndicator} ${animate ? ui.segIndicatorAnim : ''}`}
      style={box
        ? { width: box.w, height: box.h, transform: `translate(${box.x}px, ${box.y}px)`, borderRadius: radius }
        : { opacity: 0 }}
    />
  )
}
