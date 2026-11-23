'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { CameraIcon, CheckIcon, LightningIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'
import { AMOUNT_LABEL, type Amount } from '@/lib/sightings'
import { XP_PHOTO, type PlugInfo } from '@/lib/xp'

// Slides up after a Spotted is saved (the save already happened — nothing
// here blocks it). Optional extras: how many (Just a few / Plenty), a photo
// (+15 XP), and how close you are to being this store's Plug.

export type SavedSheetState = {
  drinkLabel: string
  reportId: string | null
  xp: number
  bounty: number
  amount: Amount | null
  plug: PlugInfo | null
  photo: { state: 'idle' | 'uploading' | 'done' | 'error'; url?: string; message?: string }
}

export default function SightingSavedSheet({ s, storeName, onAmount, onPhoto, onUndo, onClose }: {
  s: SavedSheetState
  storeName: string
  onAmount: (a: Amount) => void
  onPhoto: (file: File) => void
  onUndo: () => void
  onClose: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  if (typeof document === 'undefined') return null
  const added = s.amount !== null || s.photo.state === 'done'
  const totalXp = s.xp + (s.photo.state === 'done' ? XP_PHOTO : 0)

  return createPortal(
    <div className="anim-fade" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div className="anim-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Sighting saved"
        style={{ width: '100%', maxWidth: 480, background: 'var(--surface)', borderRadius: '24px 24px 0 0', border: '1px solid var(--fg-08)', padding: '12px 16px calc(env(safe-area-inset-bottom) + 18px)' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--fg-20)', margin: '0 auto 16px' }} />

        {/* Saved */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: s.bounty ? 10 : 18 }}>
          <span className="anim-pop" style={{ width: 52, height: 52, borderRadius: 15, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckIcon size={26} color="#0D1210" />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>Sighting saved!</span>
            <span style={{ display: 'block', fontSize: 14, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.drinkLabel} · {storeName}</span>
          </span>
          <span key={totalXp} className="anim-bump" style={{ fontSize: 17, fontWeight: 700, color: 'var(--accent-text)', flexShrink: 0 }}>+{totalXp} XP</span>
        </div>
        {s.bounty > 0 && (
          <p className="anim-rise" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#FFB300', marginBottom: 16 }}>
            <LightningIcon size={14} color="#FFB300" /> Bounty claimed: +{s.bounty} XP for checking a quiet store
          </p>
        )}

        {/* How many */}
        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          How many did you see? <span style={{ fontWeight: 400, color: 'var(--text-dim)' }}>(optional)</span>
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          {(['few', 'plenty'] as Amount[]).map((a) => {
            const on = s.amount === a
            return (
              <button key={a} onClick={() => onAmount(a)} className="press"
                style={{ minHeight: 48, borderRadius: 13, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', border: `1px solid ${on ? '#C9F400' : 'var(--fg-10)'}`, background: on ? 'rgba(201,244,0,0.14)' : 'var(--fg-03)', color: on ? 'var(--accent-text)' : 'var(--text)' }}>
                {AMOUNT_LABEL[a]}
              </button>
            )
          })}
        </div>

        {/* Photo (optional) */}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = '' }} />
        {s.photo.state === 'done' && s.photo.url ? (
          <div className="anim-fade" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 10, borderRadius: 13, border: '1px solid rgba(201,244,0,0.35)', background: 'rgba(201,244,0,0.06)', marginBottom: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={s.photo.url} alt="" style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover' }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Photo added</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-text)' }}>+{XP_PHOTO} XP</span>
          </div>
        ) : (
          <button onClick={() => fileRef.current?.click()} disabled={s.photo.state === 'uploading' || !s.reportId}
            style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 13, border: '1px dashed var(--fg-20)', background: 'none', color: 'var(--text)', fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 12, opacity: s.photo.state === 'uploading' ? 0.6 : 1 }}>
            <CameraIcon size={18} color="var(--text)" />
            {s.photo.state === 'uploading' ? 'Uploading…' : <>Add a photo <span style={{ color: 'var(--accent-text)' }}>+{XP_PHOTO} XP</span></>}
          </button>
        )}
        {s.photo.state === 'error' && <p style={{ fontSize: 13, color: '#FF6B6B', margin: '-4px 0 10px' }}>{s.photo.message}</p>}

        {/* Plug progress */}
        {s.plug && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 13, background: 'var(--fg-04)', marginBottom: 14 }}>
            <LightningIcon size={18} color="var(--accent-text)" />
            <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.45 }}>
              {s.plug.isPlug
                ? <>You&apos;re this store&apos;s <strong style={{ color: 'var(--text)' }}>Plug</strong> this week. {s.plug.myCount} sighting{s.plug.myCount === 1 ? '' : 's'} and counting.</>
                : <>{s.plug.toBecome} more sighting{s.plug.toBecome === 1 ? '' : 's'} here this week to become this store&apos;s <strong style={{ color: 'var(--text)' }}>Plug</strong>{s.plug.plugName ? <> (now @{s.plug.plugName})</> : null}</>}
            </p>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className={ui.btnGhost} onClick={onUndo} style={{ fontSize: 14, color: 'var(--text-dim)' }}>Undo</button>
          <button className={added ? ui.btnPrimary : ui.btnSecondary} onClick={onClose} style={{ flex: 1 }}>{added ? 'Done' : 'Skip'}</button>
        </div>
      </div>
    </div>,
    document.body
  )
}
