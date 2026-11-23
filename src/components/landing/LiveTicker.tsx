'use client'

import { useEffect, useState } from 'react'
import styles from './landing.module.css'

// "Live right now" strip under the landing hero: real recent sightings
// from /api/landing/activity, scrolling slowly. Renders nothing until real
// data loads (never placeholder rows), and nothing if there's too little.

type Item = { flavor: string; amount: 'few' | 'plenty' | null; store: string; state: string | null; at: string }

function ago(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h ago` : 'yesterday'
}

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
          <span className={styles.tickerDot} style={{ background: '#C9F400' }} />
          <strong>{it.flavor}</strong>
          <span style={{ color: '#C9F400', fontWeight: 600 }}>Spotted{it.amount ? ` · ${it.amount === 'plenty' ? 'Plenty' : 'Just a few'}` : ''}</span>
          <span className={styles.tickerMeta}>· {it.store}{it.state ? ` · ${it.state}` : ''} · {ago(it.at)}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <section className={styles.ticker} aria-label="Live sightings">
      <div className={`${styles.container} ${styles.tickerHead}`}>
        <span className={styles.tickerLive}><i />Live right now</span>
        {today != null && today > 0 && <span className={styles.tickerCount}>{today.toLocaleString('en-US')} sighting{today === 1 ? '' : 's'} in the last day</span>}
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
