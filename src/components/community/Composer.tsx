'use client'

import { useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CameraIcon, CloseIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'
import { Avatar } from './RichText'
import { useAuth } from '@/contexts/AuthContext'
import { DrinkPicker, StorePicker } from './Pickers'
import { type PostType } from './types'
import { AMOUNT_LABEL, legacyQuantity, type Amount } from '@/lib/sightings'
import SlideHighlight from '@/components/ui/SlideHighlight'

const MAX_BODY = 500
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

type StoreLite = { id: string; name: string; address: string | null }
type DrinkLite = { id: string; brand: string; flavor: string }

// Post composer with three post types (when community-v3.sql has run):
//  • Post — text, photos, optional store tag
//  • Found it — store + drink + stock level (+ photos); also files the stock report
//  • Looking for — a drink you're hunting; others answer with a store
export default function Composer({ username, v3, onPosted, toast }: {
  username: string
  v3: boolean
  onPosted: () => void
  toast: (msg: string) => void
}) {
  const { profile } = useAuth()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<PostType>('post')
  const [text, setText] = useState('')
  const [store, setStore] = useState<StoreLite | null>(null)
  const [drink, setDrink] = useState<DrinkLite | null>(null)
  // Optional on a Found it post: "Just a few" / "Plenty".
  const [amount, setAmount] = useState<Amount | null>(null)
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([])
  const [posting, setPosting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const maxPhotos = v3 ? 4 : 1

  function reset() {
    photos.forEach((p) => URL.revokeObjectURL(p.preview))
    setText(''); setStore(null); setDrink(null); setAmount(null); setPhotos([]); setType('post'); setOpen(false)
  }

  function addPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    const next = [...photos]
    for (const file of files) {
      if (next.length >= maxPhotos) { toast(`Up to ${maxPhotos} photo${maxPhotos === 1 ? '' : 's'} per post.`); break }
      if (!file.type.startsWith('image/')) { toast('Please choose image files.'); continue }
      if (file.size > MAX_PHOTO_BYTES) { toast('Each image must be under 5MB.'); continue }
      next.push({ file, preview: URL.createObjectURL(file) })
    }
    setPhotos(next)
  }

  const canPost =
    type === 'post' ? text.trim().length > 0 :
    type === 'found' ? !!store && !!drink :
    !!drink

  async function submit() {
    if (!canPost || posting) return
    setPosting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { toast('Session expired. Please sign in again.'); setPosting(false); return }

    const urls: string[] = []
    for (const p of photos) {
      const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${p.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('community-photos').upload(path, p.file)
      if (error) { toast('Could not upload a photo. Please try again.'); setPosting(false); return }
      urls.push(supabase.storage.from('community-photos').getPublicUrl(path).data.publicUrl)
    }

    const res = await fetch('/api/community/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({
        body: text.trim(),
        post_type: type,
        store_id: store?.id ?? null,
        drink_id: drink?.id ?? null,
        quantity: type === 'found' && amount ? legacyQuantity('spotted', amount) : null,
        photo_urls: urls,
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { toast(json.error ?? 'Could not post. Please try again.'); setPosting(false); return }

    // "Found it" doubles as a Spotted sighting, through the normal report
    // route (same geofence, daily limit and 30-minute rule).
    if (type === 'found' && store && drink) {
      const coords = await currentPositionIfGranted()
      const r = await fetch('/api/stock/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ store_id: store.id, reports: [{ drink_id: drink.id, sighting: 'spotted', amount }], ...(coords ?? {}) }),
      })
      const rj = await r.json().catch(() => ({}))
      if (!r.ok) toast(`Posted. The sighting didn’t go through: ${rj.error ?? 'log it from the store page instead.'}`)
      else if (rj.submitted === 0) toast('Posted. You logged that drink here in the last 30 minutes.')
      else toast('Posted and logged as a sighting. Thanks!')
    } else {
      toast('Posted!')
    }

    reset()
    setPosting(false)
    onPosted()
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className={ui.card} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <Avatar name={username} url={profile?.avatar_url} size={32} />
        <span style={{ flex: 1, fontSize: 15, color: 'var(--text-dim)' }}>Share a find, ask, or post an update…</span>
        <span className={ui.btnPrimary} style={{ minHeight: 34, padding: '6px 14px', fontSize: 14 }}>Post</span>
      </button>
    )
  }

  return (
    <div className={`${ui.card} anim-rise`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {v3 && (
        <div className={`${ui.segmented} ${ui.segSlide}`} style={{ alignSelf: 'flex-start' }}>
          <SlideHighlight activeKey={type} />
          {([['post', 'Post'], ['found', 'Found it'], ['looking', 'Looking for']] as const).map(([t, label]) => (
            <button key={t} data-active={type === t} className={`${ui.segment} ${type === t ? ui.segmentActive : ''}`} style={{ padding: '7px 12px', fontSize: 13 }} onClick={() => setType(t)}>{label}</button>
          ))}
        </div>
      )}

      {type !== 'post' && <DrinkPicker value={drink} onChange={setDrink} placeholder={type === 'found' ? 'Which drink did you find?' : 'Which drink are you hunting?'} />}
      {type === 'found' && <StorePicker value={store} onChange={setStore} placeholder="Which store?" />}
      {type === 'found' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--text-dim)', marginRight: 2 }}>How many? <span style={{ opacity: 0.8 }}>(optional)</span></span>
          {(['few', 'plenty'] as Amount[]).map((a) => (
            <button key={a} className={`${ui.chip} ${amount === a ? ui.chipActive : ''}`} onClick={() => setAmount(amount === a ? null : a)}>{AMOUNT_LABEL[a]}</button>
          ))}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_BODY))}
        placeholder={type === 'post' ? 'Share a find, tip, or update… (use @name to mention someone)' : 'Add a note (optional)'}
        rows={3}
        autoFocus={type === 'post'}
        className={ui.input}
        style={{ resize: 'none', fontSize: 15, lineHeight: 1.5 }}
      />

      {photos.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {photos.map((p, i) => (
            <div key={p.preview} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 10, display: 'block' }} />
              <button aria-label="Remove photo" onClick={() => { URL.revokeObjectURL(p.preview); setPhotos(photos.filter((_, n) => n !== i)) }} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <CloseIcon size={10} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}

      {type === 'post' && <StorePicker value={store} onChange={setStore} placeholder="Tag a store (optional)" />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input ref={fileRef} type="file" accept="image/*" multiple={maxPhotos > 1} onChange={addPhotos} style={{ display: 'none' }} />
        <button className={ui.btnSecondary} style={{ minHeight: 38, padding: '6px 12px', fontSize: 14 }} onClick={() => fileRef.current?.click()} disabled={photos.length >= maxPhotos}>
          <CameraIcon size={14} color="var(--text-muted)" /> Photo{maxPhotos > 1 ? 's' : ''}
        </button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: text.length >= MAX_BODY ? '#FF4545' : 'var(--text-dim)' }}>{text.length}/{MAX_BODY}</span>
        {!posting && <button className={ui.btnGhost} style={{ minHeight: 38 }} onClick={reset}>Cancel</button>}
        <button className={ui.btnPrimary} style={{ minHeight: 38 }} onClick={submit} disabled={!canPost || posting}>
          {posting ? 'Posting…' : type === 'found' ? 'Post & report' : 'Post'}
        </button>
      </div>
    </div>
  )
}

/** Location for the report geofence, only if the user already granted it —
 *  never triggers a permission prompt (same rule as Report Stock). */
async function currentPositionIfGranted(): Promise<{ lat: number; lng: number } | null> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
    if (status?.state !== 'granted') return null
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      )
    })
  } catch {
    return null
  }
}
