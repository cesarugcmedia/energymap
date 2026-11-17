'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import styles from './landing.module.css'

// Phone-only sign-up bar pinned to the bottom of the landing page. Appears
// once the hero (with its own buttons) has scrolled away, and steps aside
// while the closing call-to-action, the FAQ or the footer is on screen. Hidden on
// wider screens (CSS).
export default function StickyCta({ note }: { note: string | null }) {
  const [heroGone, setHeroGone] = useState(false)
  const [stops, setStops] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const observers: IntersectionObserver[] = []
    const hero = document.getElementById('lp-hero')
    if (hero) {
      const o = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting))
      o.observe(hero)
      observers.push(o)
    }
    for (const id of ['lp-join', 'lp-faq', 'lp-footer']) {
      const el = document.getElementById(id)
      if (!el) continue
      const o = new IntersectionObserver(([e]) => setStops((s) => ({ ...s, [id]: e.isIntersecting })))
      o.observe(el)
      observers.push(o)
    }
    return () => observers.forEach((o) => o.disconnect())
  }, [])

  const visible = heroGone && !Object.values(stops).some(Boolean)
  return (
    <div className={`${styles.sticky} ${visible ? styles.stickyOn : ''}`} aria-hidden={!visible}>
      <div className={styles.stickyText}>
        <strong>Free to join</strong>
        {note && <span>{note}</span>}
      </div>
      <Link href="/account?mode=signup" className={styles.btnPrimary} tabIndex={visible ? 0 : -1}>Get started</Link>
    </div>
  )
}
