'use client'

import { useEffect, useRef, useState } from 'react'

// Ticks a number up from 0 the first time it scrolls into view. Renders the
// final value immediately under reduced motion, without JS observers, and
// for server rendering (so the real number is always in the HTML).
export default function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)
  const started = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el || started.current || value <= 0) { setShown(value); return }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) { setShown(value); return }
    setShown(0)
    let frame = 0
    const run = () => {
      started.current = true
      const start = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration)
        setShown(Math.round(value * (1 - Math.pow(1 - t, 3))))
        if (t < 1) frame = requestAnimationFrame(tick)
      }
      frame = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { io.disconnect(); run() }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => { io.disconnect(); cancelAnimationFrame(frame) }
  }, [value, duration])

  return <span ref={ref}>{shown.toLocaleString()}</span>
}
