'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ui from '@/components/ui/ui.module.css'
import SkeletonList from '@/components/ui/SkeletonList'
import { FlagIcon } from '@/components/Icons'

type Report = {
  id: string
  reason: string
  created_at: string
  reporter: string
  post_id: string
  comment_id: string | null
  target: { kind: 'post' | 'comment'; body: string; author: string; hidden?: boolean }
}

// Admin queue for reported Community posts/comments (/api/admin/community-moderation).
export default function CommunityModeration() {
  const [reports, setReports] = useState<Report[] | null>(null)
  const [enabled, setEnabled] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState(false)

  const headers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }
  }

  const load = useCallback(async () => {
    setError(false)
    const res = await fetch('/api/admin/community-moderation', { headers: await headers() })
    if (!res.ok) { setError(true); setReports([]); return }
    const json = await res.json()
    setEnabled(json.enabled !== false)
    setReports(json.reports ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  async function act(r: Report, action: 'hide' | 'dismiss' | 'delete_comment') {
    if (action === 'delete_comment' && !window.confirm('Delete this comment permanently?')) return
    setBusy(r.id)
    const res = await fetch('/api/admin/community-moderation', {
      method: 'POST',
      headers: await headers(),
      body: JSON.stringify({ action, report_id: r.id, post_id: r.post_id, comment_id: r.comment_id }),
    })
    setBusy(null)
    if (!res.ok) { window.alert('That didn’t work. Try again.'); return }
    if (action === 'delete_comment') await fetch('/api/admin/community-moderation', { method: 'POST', headers: await headers(), body: JSON.stringify({ action: 'dismiss', report_id: r.id }) })
    load()
  }

  if (reports === null) return <div className="px-4"><SkeletonList count={3} /></div>

  if (!enabled) {
    return (
      <div className={ui.emptyState}>
        <FlagIcon size={36} color="var(--text-dim)" />
        <p className={ui.emptyTitle}>Reporting isn&apos;t switched on yet</p>
        <p className={ui.emptyBody}>Run <code>scripts/community-v3.sql</code> in the Supabase SQL Editor to enable post reports, blocking and hiding.</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className={ui.emptyState}>
        <p className={ui.emptyTitle}>Couldn&apos;t load reports</p>
        <button className={ui.btnSecondary} onClick={load}>Try again</button>
      </div>
    )
  }

  if (reports.length === 0) {
    return (
      <div className={ui.emptyState}>
        <FlagIcon size={36} color="var(--text-dim)" />
        <p className={ui.emptyTitle}>No open reports</p>
        <p className={ui.emptyBody}>Reported posts and comments show up here.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {reports.map((r) => (
        <div key={r.id} className={ui.card}>
          <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 6 }}>
            <strong style={{ color: '#FFB300', fontWeight: 600 }}>{r.reason}</strong> · reported by @{r.reporter} · {new Date(r.created_at).toLocaleString()}
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>{r.target.kind === 'comment' ? 'Comment' : 'Post'} by @{r.target.author}{r.target.hidden ? ' · hidden' : ''}</p>
          <p style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.45, whiteSpace: 'pre-wrap', marginBottom: 12 }}>{r.target.body}</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {r.target.kind === 'post'
              ? <button className={ui.btnPrimary} disabled={busy === r.id || r.target.hidden} onClick={() => act(r, 'hide')}>Hide post</button>
              : <button className={ui.btnPrimary} disabled={busy === r.id} onClick={() => act(r, 'delete_comment')}>Delete comment</button>}
            <button className={ui.btnSecondary} disabled={busy === r.id} onClick={() => act(r, 'dismiss')}>Dismiss</button>
            <a className={ui.btnGhost} href={`/community?post=${r.post_id}`} target="_blank" rel="noreferrer">Open</a>
          </div>
        </div>
      ))}
    </div>
  )
}
