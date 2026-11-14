'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isMissingSchema } from '@/lib/community'
import { useAuth } from '@/contexts/AuthContext'
import Toast from '@/components/Toast'
import BackButton from '@/components/BackButton'
import SkeletonList from '@/components/ui/SkeletonList'
import ui from '@/components/ui/ui.module.css'
import { CheckIcon, PinIcon, UsersIcon } from '@/components/Icons'
import { Avatar, RichText } from '@/components/community/RichText'
import { timeAgo } from '@/components/community/types'

type ProfileData = {
  profile: { id: string; username: string; joined: string; verified: boolean; weeklyChampion: boolean }
  counts: { reports: number; storesAdded: number; followers: number; following: number }
  following: boolean
}
type MiniPost = { id: string; body: string; created_at: string; photo: string | null; storeName: string | null; likes: number; type: string }

// Public profile: who they are, what they've contributed, their posts.
export default function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params)
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [data, setData] = useState<ProfileData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [posts, setPosts] = useState<MiniPost[] | null>(null)
  const [following, setFollowing] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [blocksEnabled, setBlocksEnabled] = useState(false)
  const [toast, setToast] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const showToast = (m: string) => { setToast(m); setToastVisible(true); setTimeout(() => setToastVisible(false), 2500) }

  useEffect(() => { if (!authLoading && !user) router.replace('/account') }, [user, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/community/profile?username=${encodeURIComponent(username)}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok) { setNotFound(true); return }
      const json: ProfileData = await res.json()
      setData(json)
      setFollowing(json.following)

      // Posts: try v3 columns (hidden_at, photo_urls, post_type), fall back if absent.
      const run = (v3: boolean) => {
        let q = supabase.from('community_posts')
          .select(v3 ? 'id, body, created_at, photo_url, photo_urls, post_type, store_id' : 'id, body, created_at, photo_url, store_id')
          .eq('user_id', json.profile.id).order('created_at', { ascending: false }).limit(30)
        if (v3) q = q.is('hidden_at', null)
        return q
      }
      let r = await run(true)
      if (r.error && isMissingSchema(r.error)) r = await run(false)
      const rows: any[] = r.data ?? []
      const storeIds = [...new Set(rows.map((p) => p.store_id).filter(Boolean))]
      const [{ data: stores }, { data: likes }] = await Promise.all([
        storeIds.length ? supabase.from('stores').select('id, name').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
        rows.length ? supabase.from('community_post_likes').select('post_id').in('post_id', rows.map((p) => p.id)) : Promise.resolve({ data: [] as any[] }),
      ])
      const storeName = new Map((stores ?? []).map((s: any) => [s.id, s.name]))
      const likeCount: Record<string, number> = {}
      for (const l of likes ?? []) likeCount[l.post_id] = (likeCount[l.post_id] ?? 0) + 1
      setPosts(rows.map((p) => ({
        id: p.id, body: p.body, created_at: p.created_at,
        photo: (Array.isArray(p.photo_urls) && p.photo_urls[0]) || p.photo_url || null,
        storeName: p.store_id ? storeName.get(p.store_id) ?? null : null,
        likes: likeCount[p.id] ?? 0,
        type: p.post_type ?? 'post',
      })))

      const { data: blockRow, error: blockErr } = await supabase.from('user_blocks').select('id').eq('blocker_id', user.id).eq('blocked_id', json.profile.id).maybeSingle()
      if (!blockErr) { setBlocksEnabled(true); setBlocked(!!blockRow) }
    })()
  }, [user, username])

  async function toggleFollow() {
    if (!data) return
    const next = !following
    setFollowing(next)
    setData({ ...data, counts: { ...data.counts, followers: data.counts.followers + (next ? 1 : -1) } })
    const { data: { session } } = await supabase.auth.getSession()
    const ok = session && (await fetch('/api/community/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ user_id: data.profile.id, following: next }),
    }).then((r) => r.ok).catch(() => false))
    if (!ok) {
      setFollowing(!next)
      setData((d) => d && { ...d, counts: { ...d.counts, followers: d.counts.followers + (next ? -1 : 1) } })
      showToast('Could not update follow.')
    }
  }

  async function toggleBlock() {
    if (!data || !user) return
    if (!blocked && !window.confirm(`Block @${data.profile.username}? You won’t see their posts or comments.`)) return
    const { error } = blocked
      ? await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', data.profile.id)
      : await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: data.profile.id })
    if (error && error.code !== '23505') { showToast('Could not update block.'); return }
    setBlocked(!blocked)
    showToast(blocked ? `Unblocked @${data.profile.username}` : `Blocked @${data.profile.username}`)
  }

  const isMe = data?.profile.id === user?.id
  const stat = (n: number, label: string) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>{n.toLocaleString()}</p>
      <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>{label}</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <Toast message={toast} visible={toastVisible} />
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px 100px' }}>
        <div style={{ marginBottom: 12 }}><BackButton label="Back" fallbackHref="/community" /></div>

        {notFound ? (
          <div className={ui.emptyState}>
            <UsersIcon size={36} color="var(--text-dim)" />
            <p className={ui.emptyTitle}>User not found</p>
            <p className={ui.emptyBody}>@{username} doesn&apos;t exist or changed their name.</p>
          </div>
        ) : !data ? (
          <SkeletonList count={3} />
        ) : (
          <>
            <div className="anim-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 20px' }}>
              <Avatar name={data.profile.username} size={84} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700 }}>@{data.profile.username}</h1>
                {data.profile.verified && <CheckIcon size={16} color="#60a5fa" />}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {data.profile.weeklyChampion && <span style={{ fontSize: 12, fontWeight: 700, color: '#ffd700', background: 'rgba(255,215,0,0.12)', borderRadius: 8, padding: '3px 8px' }}>👑 Weekly champion</span>}
                {data.profile.joined && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Joined {new Date(data.profile.joined).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>}
              </div>
              {!isMe && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className={following ? ui.btnSecondary : ui.btnPrimary} onClick={toggleFollow} disabled={blocked}>{following ? 'Following' : 'Follow'}</button>
                  {blocksEnabled && <button className={ui.btnGhost} onClick={toggleBlock}>{blocked ? 'Unblock' : 'Block'}</button>}
                </div>
              )}
            </div>

            <div className={ui.card} style={{ display: 'flex', marginBottom: 22 }}>
              {stat(data.counts.reports, 'Reports')}
              {stat(data.counts.storesAdded, 'Stores added')}
              {stat(data.counts.followers, 'Followers')}
              {stat(data.counts.following, 'Following')}
            </div>

            <p className={ui.sectionLabel}>Posts</p>
            {blocked ? (
              <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>You blocked this user. Unblock to see their posts.</p>
            ) : posts === null ? (
              <SkeletonList count={2} />
            ) : posts.length === 0 ? (
              <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>{isMe ? 'You haven’t posted yet.' : 'No posts yet.'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {posts.map((post, i) => (
                  <Link key={post.id} href={`/community?post=${post.id}`} className={`${ui.card} anim-rise`} style={{ display: 'flex', gap: 12, textDecoration: 'none', color: 'inherit', animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {post.type !== 'post' && <span style={{ fontSize: 12, fontWeight: 700, color: post.type === 'found' ? '#C9F400' : '#FFB300' }}>{post.type === 'found' ? 'Found it' : 'Looking for'}</span>}
                      <RichText text={post.body.length > 160 ? `${post.body.slice(0, 160)}…` : post.body} style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.45 }} />
                      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {post.storeName && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><PinIcon size={11} color="var(--text-dim)" />{post.storeName} ·</span>}
                        {timeAgo(post.created_at)} · {post.likes} like{post.likes === 1 ? '' : 's'}
                      </p>
                    </div>
                    {post.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={post.photo} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10, flexShrink: 0 }} />
                    )}
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
