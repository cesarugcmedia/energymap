'use client'

import { useRef, useState } from 'react'
import { uploadAvatar, removeAvatar } from '@/lib/avatar'
import { Avatar } from '@/components/community/RichText'
import { CameraIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'

// Account → Profile header: the profile photo with Add / Change / Remove.
export default function ProfilePhoto({ userId, username, url, onChange }: {
  userId: string
  username: string
  url: string | null
  onChange: () => Promise<void> | void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<string | null | undefined>(undefined)
  const [msg, setMsg] = useState<string | null>(null)
  const shown = preview === undefined ? url : preview

  async function pick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setMsg(null)
    const res = await uploadAvatar(userId, file)
    if (res.ok) { setPreview(res.url); await onChange() } else setMsg(res.message)
    setBusy(false)
    if (input.current) input.current.value = ''
  }

  async function remove() {
    setBusy(true)
    setMsg(null)
    const res = await removeAvatar(userId)
    if (res.ok) { setPreview(null); await onChange() } else setMsg(res.message)
    setBusy(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={shown ? 'Change profile photo' : 'Add a profile photo'}
        style={{ position: 'relative', padding: 0, border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%', opacity: busy ? 0.6 : 1 }}
      >
        <Avatar name={username} url={shown} size={92} />
        <span style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: '50%', background: '#C9F400', border: '3px solid var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {busy
            ? <span style={{ width: 14, height: 14, border: '2px solid #0D1210', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            : <CameraIcon size={15} color="#0D1210" />}
        </span>
      </button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div style={{ display: 'flex', gap: 14 }}>
        <button className={ui.linkQuiet} onClick={() => input.current?.click()} disabled={busy}>{shown ? 'Change photo' : 'Add a photo'}</button>
        {shown && <button className={ui.linkQuiet} onClick={remove} disabled={busy}>Remove</button>}
      </div>
      {msg && <p style={{ fontSize: 13, color: '#FF8A3D', textAlign: 'center', maxWidth: 280 }}>{msg}</p>}
    </div>
  )
}
