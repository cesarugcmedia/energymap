'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '@/components/Icons'

// Full-screen photo viewer: tap outside / ✕ / Esc to close, arrows or swipe
// to move between a post's photos.
export default function Lightbox({ photos, start, onClose }: { photos: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start)
  const touchX = useRef<number | null>(null)
  const go = (d: number) => setI((n) => (n + d + photos.length) % photos.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const navBtn: React.CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 22, cursor: 'pointer' }

  return createPortal(
    <div
      className="anim-fade"
      onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        if (Math.abs(dx) > 50 && photos.length > 1) go(dx < 0 ? 1 : -1)
        touchX.current = null
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'env(safe-area-inset-top) 0 env(safe-area-inset-bottom)' }}
      role="dialog"
      aria-label="Photo viewer"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={i} src={photos[i]} alt="" className="anim-fade" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      <button onClick={onClose} aria-label="Close" style={{ position: 'absolute', top: 'calc(env(safe-area-inset-top) + 12px)', right: 12, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
        <CloseIcon size={14} color="#fff" />
      </button>
      {photos.length > 1 && (
        <>
          <button aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); go(-1) }} style={{ ...navBtn, left: 12 }}>‹</button>
          <button aria-label="Next photo" onClick={(e) => { e.stopPropagation(); go(1) }} style={{ ...navBtn, right: 12 }}>›</button>
          <div style={{ position: 'absolute', bottom: 'calc(env(safe-area-inset-bottom) + 18px)', display: 'flex', gap: 6 }}>
            {photos.map((_, n) => <span key={n} style={{ width: 7, height: 7, borderRadius: '50%', background: n === i ? '#fff' : 'var(--fg-35)' }} />)}
          </div>
        </>
      )}
    </div>,
    document.body
  )
}
