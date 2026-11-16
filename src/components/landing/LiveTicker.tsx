'use client'

import { useEffect, useState } from 'react'
import styles from './landing.module.css'

// "Live right now" strip under the landing hero: real recent stock reports
// from /api/landing/activity, scrolling slowly. Renders nothing until real
// data loads (never placeholder rows), and nothing if there's too little.

type Item = { flavor: string; quantity: 'full' | 'medium' | 'low' | 'out'; chain: string; place: string | null; at: string }

const LEVEL: Record<Item['quantity'], { word: string; color: string }> = {
  full: { word: 'Full', color: '#C9F400' },
  medium: { word: 'Medium', color: '#FFB300' },
  low: { word: 'Low', color: '#FFB300' },
  out: { word: 'Out', color: '#FF4545' },
}

function ago(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h ago` : 'yesterday'
}

const an = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a')

export default function LiveTicker() {
  const [items, setItems] = useState<Item[] | null>(null)
  const [today, setToday] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/landing/activity')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.items) { setItems(d.items); setToday(d.reportsToday ?? null) } })
      .catch(() => {})
  }, [])

  if (!items || items.length < 3) return null

  const row = (key: string, hidden = false) => (
    <ul className={styles.tickerRow} aria-hidden={hidden || undefined} key={key}>
      {items.map((it, i) => (
        <li key={i} className={styles.tickerItem}>
          <span className={styles.tickerDot} style={{ background: LEVEL[it.quantity].color }} />
          <strong>{it.flavor}</strong>
          <span style={{ color: LEVEL[it.quantity].color, fontWeight: 600 }}>{LEVEL[it.quantity].word}</span>
          <span className={styles.tickerMeta}>· {an(it.chain)} {it.chain}{it.place ? ` in ${it.place}` : ''} · {ago(it.at)}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <section className={styles.ticker} aria-label="Live stock reports">
      <div className={`${styles.container} ${styles.tickerHead}`}>
        <span className={styles.tickerLive}><i />Live right now</span>
        {today != null && today > 0 && <span className={styles.tickerCount}>{today.toLocaleString('en-US')} report{today === 1 ? '' : 's'} in the last day</span>}
      </div>
      <div className={styles.tickerViewport}>
        <div className={styles.tickerTrack} style={{ ['--ticker-dur' as string]: `${Math.max(30, items.length * 6)}s` }}>
          {row('a')}
          {row('b', true)}
        </div>
      </div>
    </section>
  )
}
