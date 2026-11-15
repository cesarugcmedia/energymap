'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import ui from '@/components/ui/ui.module.css'
import { CheckIcon, CloseIcon, SearchIcon } from '@/components/Icons'
import { Avatar } from './RichText'
import FollowButton from './FollowButton'

export type Person = { id: string; username: string; verified: boolean; following: boolean; isMe: boolean; avatarUrl?: string | null; reason?: string | null }

type Props =
  | { mode: 'search'; onClose: () => void; title?: string }
  | { mode: 'followers' | 'following'; userId: string; username: string; onClose: () => void; onFollowChange?: (delta: number) => void }

async function authHeader(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { Authorization: `Bearer ${session.access_token}` } : null
}

// Bottom sheet listing people: a username search (Community → Find people)
// or someone's followers / following (tap the counts on /u/[username]).
// Each row links to the profile and has its own Follow button.
export default function PeopleSheet(props: Props) {
  const { mode, onClose } = props
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<Person[] | null>(mode === 'search' ? [] : null)
  const [busy, setBusy] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listUser = mode === 'search' ? null : props.userId
  // Search mode with an empty box shows "Suggested for you" instead.
  const [suggested, setSuggested] = useState<Person[] | null>(null)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [onClose])

  // Follower / following list: load once.
  useEffect(() => {
    if (!listUser) return
    let live = true
    ;(async () => {
      const h = await authHeader()
      if (!h) return
      const res = await fetch(`/api/community/people?list=${mode}&user=${listUser}`, { headers: h })
      const json = res.ok ? await res.json() : { people: [] }
      if (live) setPeople(json.people ?? [])
    })()
    return () => { live = false }
  }, [listUser, mode])

  useEffect(() => {
    if (mode !== 'search') return
    let live = true
    ;(async () => {
      const h = await authHeader()
      if (!h) return
      const res = await fetch('/api/community/people?suggest=1', { headers: h }).catch(() => null)
      const json = res?.ok ? await res.json() : { people: [] }
      if (live) setSuggested(json.people ?? [])
    })()
    return () => { live = false }
  }, [mode])

  // Search: debounced as you type.
  useEffect(() => {
    if (mode !== 'search') return
    const q = query.trim().replace(/^@/, '')
    if (q.length < 2) { setPeople([]); return }
    setPeople(null)
    let live = true
    const t = setTimeout(async () => {
      const h = await authHeader()
      if (!h) return
      const res = await fetch(`/api/community/people?q=${encodeURIComponent(q)}`, { headers: h })
      const json = res.ok ? await res.json() : { people: [] }
      if (live) setPeople(json.people ?? [])
    }, 300)
    return () => { live = false; clearTimeout(t) }
  }, [query, mode])

  async function toggleFollow(p: Person) {
    const h = await authHeader()
    if (!h || busy) return
    const next = !p.following
    setBusy(p.id)
    const flip = (v: boolean) => (list: Person[] | null) => list && list.map((x) => (x.id === p.id ? { ...x, following: v } : x))
    setPeople(flip(next)); setSuggested(flip(next))
    const res = await fetch('/api/community/follow', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: p.id, following: next }),
    }).catch(() => null)
    if (!res?.ok) { setPeople(flip(!next)); setSuggested(flip(!next)) }
    else if (mode !== 'search') props.onFollowChange?.(next ? 1 : -1)
    setBusy(null)
  }

  const title = mode === 'search' ? (props.title ?? 'Find people') : mode === 'followers' ? `Followers of @${props.username}` : `@${props.username} follows`
  const q = query.trim().replace(/^@/, '')

  const renderRows = (list: Person[]) => list.map((p, i) => (
    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 2px', borderTop: i === 0 ? 'none' : '1px solid var(--fg-06)' }}>
      <Link href={`/u/${p.username}`} onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textDecoration: 'none' }}>
        <Avatar name={p.username} url={p.avatarUrl} userId={p.id} size={40} />
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.username}</span>
            {p.verified && <CheckIcon size={14} color="#60a5fa" />}
          </span>
          {p.reason && <span style={{ fontSize: 13, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.reason}</span>}
        </span>
      </Link>
      {p.isMe
        ? <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>You</span>
        : <FollowButton compact following={p.following} disabled={busy === p.id} onToggle={() => toggleFollow(p)} />}
    </div>
  ))

  let body: React.ReactNode
  if (mode === 'search' && q.length < 2) {
    body = suggested === null
      ? <p style={{ padding: '18px 4px', fontSize: 15, color: 'var(--text-muted)' }}>Finding people near you…</p>
      : suggested.length === 0
        ? <p style={{ padding: '18px 4px', fontSize: 15, color: 'var(--text-muted)' }}>Type at least 2 letters of a username.</p>
        : <><p className={ui.sectionLabel} style={{ margin: '12px 2px 4px' }}>Suggested for you</p>{renderRows(suggested)}</>
  } else if (people === null) {
    body = <p style={{ padding: '18px 4px', fontSize: 15, color: 'var(--text-muted)' }}>Loading…</p>
  } else if (people.length === 0) {
    body = (
      <p style={{ padding: '18px 4px', fontSize: 15, color: 'var(--text-muted)' }}>
        {mode === 'search'
          ? q.length < 2 ? 'Type at least 2 letters of a username.' : `No one called “${q}”.`
          : mode === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
      </p>
    )
  } else {
    body = renderRows(people)
  }

  return createPortal(
    <div className="anim-fade" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div
        className="anim-sheet"
        role="dialog"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 600, height: '78vh', display: 'flex', flexDirection: 'column', background: 'var(--surface)', borderRadius: '24px 24px 0 0', border: '1px solid var(--fg-08)', padding: '14px 16px 0' }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--fg-20)', margin: '0 auto 12px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <p style={{ flex: 1, fontSize: 18, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</p>
          <button className={ui.iconBtn} aria-label="Close" onClick={onClose}><CloseIcon size={18} /></button>
        </div>
        {mode === 'search' && (
          <div style={{ position: 'relative', marginBottom: 6 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex' }}><SearchIcon size={16} /></span>
            <input
              ref={inputRef}
              autoFocus
              className={ui.input}
              style={{ paddingLeft: 36 }}
              placeholder="Search by username"
              value={query}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(env(safe-area-inset-bottom) + 16px)' }}>{body}</div>
      </div>
    </div>,
    document.body
  )
}
