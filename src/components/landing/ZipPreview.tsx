'use client'

import { useState } from 'react'
import Link from 'next/link'
import { StoreTypeIcon, SearchIcon } from '@/components/Icons'
import styles from './landing.module.css'
import { FREE_RADIUS_MILES } from '@/lib/plans'
import { isFresh } from '@/lib/freshness'

// "See what's near you" — lets a logged-out visitor try the product with a
// ZIP code before signing up. Backed by /api/preview (free-tier radius, top 5
// stores, 3 drinks each).

type PreviewStore = {
  name: string
  type: string | null
  distanceMi: number
  lastReportedAt: string | null
  inStock: { brand: string; flavor: string; quantity: string }[]
  inStockCount: number
}
type PreviewResult = { zip: string; totalStores: number; reportedStores: number; stores: PreviewStore[] }

const LEVEL: Record<string, { label: string; color: string }> = {
  full: { label: 'Full', color: '#C9F400' },
  medium: { label: 'Med', color: '#FFB300' },
  low: { label: 'Low', color: '#FFB300' },
}

function ago(iso: string) {
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function freshColor(iso: string | null) {
  if (!iso) return '#6B7468'
  return isFresh(iso) ? '#C9F400' : '#FFB300'
}

export default function ZipPreview() {
  const [zip, setZip] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<PreviewResult | null>(null)

  async function lookup(e: React.FormEvent) {
    e.preventDefault()
    if (!/^\d{5}$/.test(zip)) { setError('Enter a 5-digit ZIP code.'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/preview?zip=${zip}`)
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Something went wrong. Try again.'); setResult(null) }
      else setResult(json)
    } catch {
      setError('Could not connect. Try again.')
    }
    setLoading(false)
  }

  return (
    <div className={styles.preview}>
      <form onSubmit={lookup} className={styles.previewForm}>
        <label htmlFor="preview-zip" className={styles.srOnly}>ZIP code</label>
        <div className={styles.previewInputWrap}>
          <SearchIcon size={18} color="#7E8A80" />
          <input
            id="preview-zip"
            className={styles.previewInput}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            placeholder="Enter your ZIP code"
            value={zip}
            onChange={(e) => { setZip(e.target.value.replace(/\D/g, '').slice(0, 5)); setError(null) }}
          />
        </div>
        <button type="submit" className={styles.btnPrimary} disabled={loading}>
          {loading ? 'Checking…' : 'Show stores'}
        </button>
      </form>

      {error && <p className={styles.previewError} role="alert">{error}</p>}

      {result && (
        <div className={styles.previewResults} aria-live="polite">
          {result.totalStores === 0 ? (
            <div className={styles.previewEmpty}>
              <p className={styles.h3}>No stores near {result.zip} yet.</p>
              <p className={styles.body}>Be the first. Sign up and add the stores you shop at; it takes a few seconds.</p>
              <Link href="/account?mode=signup" className={styles.btnPrimary}>Get started free</Link>
            </div>
          ) : (
            <>
              <p className={styles.previewSummary}>
                <strong>{result.totalStores}</strong> store{result.totalStores === 1 ? '' : 's'} within {FREE_RADIUS_MILES} miles of {result.zip}
                {result.reportedStores > 0 && <> · <strong>{result.reportedStores}</strong> with stock reports</>}
              </p>
              <ul className={styles.previewList}>
                {result.stores.map((s, i) => (
                  <li key={`${s.name}-${i}`} className={styles.previewStore}>
                    <div className={styles.previewStoreHead}>
                      <StoreTypeIcon type={s.type ?? undefined} size={20} color="#A4B0A6" />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p className={styles.previewName}>{s.name}</p>
                        <p className={styles.previewMeta}>
                          <span className={styles.previewDot} style={{ background: freshColor(s.lastReportedAt) }} />
                          {s.lastReportedAt ? `Reported ${ago(s.lastReportedAt)}` : 'No reports yet'} · {s.distanceMi} mi
                        </p>
                      </div>
                    </div>
                    {s.inStock.length > 0 && (
                      <div className={styles.previewChips}>
                        {s.inStock.map((d) => {
                          const lvl = LEVEL[d.quantity] ?? LEVEL.full
                          return (
                            <span key={`${d.brand}-${d.flavor}`} className={styles.previewChip}>
                              {d.brand} {d.flavor}
                              <em style={{ color: lvl.color }}>{lvl.label}</em>
                            </span>
                          )
                        })}
                        {s.inStockCount > s.inStock.length && <span className={styles.previewMore}>+{s.inStockCount - s.inStock.length} more</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className={styles.previewCta}>
                <p className={styles.body}>
                  {result.totalStores > result.stores.length
                    ? `Sign up free to see all ${result.totalStores} stores on the map, every flavor, and live updates.`
                    : 'Sign up free to see every flavor on the map and get live updates.'}
                </p>
                <Link href="/account?mode=signup" className={styles.btnPrimary}>See the full map</Link>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
