'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import NotificationBell from '@/components/NotificationBell'
import Toast from '@/components/Toast'

type SortMode = 'trending' | 'recent'

interface Post {
  id: string
  user_id: string
  store_id: string | null
  body: string
  created_at: string
  username: string
  storeName: string | null
  likeCount: number
  likedByMe: boolean
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const MAX_BODY = 500
const POST_LIMIT = 50

export default function CommunityPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [sortMode, setSortMode] = useState<SortMode>('trending')
  const [topWeeklyIds, setTopWeeklyIds] = useState<Set<string>>(new Set())

  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [storeQuery, setStoreQuery] = useState('')
  const [storeResults, setStoreResults] = useState<{ id: string; name: string }[]>([])
  const [selectedStore, setSelectedStore] = useState<{ id: string; name: string } | null>(null)

  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  function showToast(message: string) {
    setToastMessage(message)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2500)
  }

  useEffect(() => {
    if (!user) return
    fetchPosts()
    supabase.rpc('get_leaderboard', { p_timeframe: 'This Week' }).then(({ data }) => {
      if (data) setTopWeeklyIds(new Set(data.slice(0, 10).map((e: any) => e.id)))
    })
  }, [user])

  async function fetchPosts() {
    setLoading(true)
    const { data: postRows } = await supabase
      .from('community_posts')
      .select('id, user_id, store_id, body, created_at')
      .order('created_at', { ascending: false })
      .limit(POST_LIMIT)

    if (!postRows || postRows.length === 0) {
      setPosts([])
      setLoading(false)
      return
    }

    const userIds = [...new Set(postRows.map((p) => p.user_id))]
    const storeIds = [...new Set(postRows.map((p) => p.store_id).filter(Boolean))] as string[]
    const postIds = postRows.map((p) => p.id)

    const [{ data: profiles }, { data: stores }, { data: likes }] = await Promise.all([
      supabase.from('profiles').select('id, username').in('id', userIds),
      storeIds.length > 0 ? supabase.from('stores').select('id, name').in('id', storeIds) : Promise.resolve({ data: [] }),
      supabase.from('community_post_likes').select('post_id, user_id').in('post_id', postIds),
    ])

    const usernameMap = Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.username]))
    const storeNameMap = Object.fromEntries((stores ?? []).map((s: any) => [s.id, s.name]))
    const likesByPost: Record<string, { count: number; mine: boolean }> = {}
    ;(likes ?? []).forEach((l: any) => {
      if (!likesByPost[l.post_id]) likesByPost[l.post_id] = { count: 0, mine: false }
      likesByPost[l.post_id].count++
      if (l.user_id === user!.id) likesByPost[l.post_id].mine = true
    })

    setPosts(postRows.map((p) => ({
      ...p,
      username: usernameMap[p.user_id] ?? 'Someone',
      storeName: p.store_id ? (storeNameMap[p.store_id] ?? null) : null,
      likeCount: likesByPost[p.id]?.count ?? 0,
      likedByMe: likesByPost[p.id]?.mine ?? false,
    })))
    setLoading(false)
  }

  useEffect(() => {
    const q = storeQuery.trim()
    if (q.length < 2) { setStoreResults([]); return }
    let cancelled = false
    supabase
      .from('stores')
      .select('id, name')
      .eq('status', 'approved')
      .ilike('name', `%${q}%`)
      .limit(5)
      .then(({ data }) => { if (!cancelled) setStoreResults(data ?? []) })
    return () => { cancelled = true }
  }, [storeQuery])

  async function submitPost() {
    const trimmed = draft.trim()
    if (!trimmed || posting) return
    setPosting(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { showToast('Session expired. Please sign in again.'); setPosting(false); return }

    const res = await fetch('/api/community/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ body: trimmed, store_id: selectedStore?.id }),
    })
    const json = await res.json().catch(() => ({}))

    if (!res.ok) {
      showToast(json.error ?? 'Could not post. Please try again.')
      setPosting(false)
      return
    }

    setDraft('')
    setSelectedStore(null)
    setStoreQuery('')
    showToast('Posted!')
    await fetchPosts()
    setPosting(false)
  }

  async function toggleLike(post: Post) {
    const nextLiked = !post.likedByMe
    setPosts((prev) => prev.map((p) => p.id === post.id
      ? { ...p, likedByMe: nextLiked, likeCount: p.likeCount + (nextLiked ? 1 : -1) }
      : p
    ))
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await fetch('/api/community/like', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ post_id: post.id, liked: nextLiked }),
    }).catch(() => {})
  }

  const sorted = useMemo(() => {
    const copy = [...posts]
    if (sortMode === 'trending') copy.sort((a, b) => b.likeCount - a.likeCount)
    else copy.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return copy
  }, [posts, sortMode])

  const postsToday = useMemo(() => {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    return posts.filter((p) => new Date(p.created_at) >= todayStart).length
  }, [posts])

  const trendingStores = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const counts: Record<string, { id: string; name: string; count: number }> = {}
    posts.forEach((p) => {
      if (!p.store_id || !p.storeName) return
      if (new Date(p.created_at).getTime() < weekAgo) return
      if (!counts[p.store_id]) counts[p.store_id] = { id: p.store_id, name: p.storeName, count: 0 }
      counts[p.store_id].count++
    })
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 5)
  }, [posts])

  if (authLoading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', backgroundColor: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden', position: 'relative', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .action-btn { transition: opacity 0.15s ease, transform 0.15s ease; cursor: pointer; }
        .action-btn:hover { opacity: 0.88; }
        .action-btn:active { transform: scale(0.97); }
        .pill-btn { transition: all 0.15s ease; cursor: pointer; }
      `}</style>
      <Toast message={toastMessage} visible={toastVisible} />

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '12px 0 16px', animation: 'fadeUp 0.5s ease' }}>
          <div>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 32, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--text)', lineHeight: 1 }}>
              Commu<span style={{ color: 'var(--accent)' }}>nity</span>
            </h1>
            <p style={{ fontSize: 13, color: '#7A8F80', marginTop: 4, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: "'Barlow Condensed', sans-serif" }}>
              {loading ? 'Loading…' : `${postsToday} post${postsToday !== 1 ? 's' : ''} today`}
            </p>
          </div>
          <NotificationBell />
        </div>

        {/* Sort chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['trending', 'recent'] as SortMode[]).map((mode) => {
            const active = sortMode === mode
            return (
              <button key={mode} className="pill-btn"
                onClick={() => setSortMode(mode)}
                style={{ padding: '7px 16px', borderRadius: 99, border: '1px solid', borderColor: active ? '#C9F400' : 'rgba(201,244,0,0.12)', backgroundColor: active ? '#C9F400' : 'var(--surface)', color: active ? '#0D1210' : '#7A8F80', fontSize: 12, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {mode === 'trending' ? '🔥 Trending' : '🕐 Recent'}
              </button>
            )
          })}
        </div>

        {/* Composer */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 16, padding: 14, marginBottom: 18 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_BODY))}
            placeholder="Share a find, tip, or update..."
            rows={2}
            style={{ width: '100%', resize: 'none', backgroundColor: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, fontFamily: "'Barlow', sans-serif", lineHeight: 1.5 }}
          />

          {selectedStore ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6, padding: '5px 10px', borderRadius: 99, backgroundColor: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.25)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>📍 {selectedStore.name}</span>
              <button onClick={() => setSelectedStore(null)} style={{ background: 'none', border: 'none', color: '#4A5F50', cursor: 'pointer', fontSize: 11 }}>✕</button>
            </div>
          ) : (
            <div style={{ position: 'relative', marginTop: 8 }}>
              <input
                type="text"
                value={storeQuery}
                onChange={(e) => setStoreQuery(e.target.value)}
                placeholder="📍 Tag a store (optional)"
                style={{ width: '100%', backgroundColor: 'var(--bg)', border: '1px solid var(--fg-08)', borderRadius: 10, padding: '8px 10px', color: 'var(--fg-70)', fontSize: 12, outline: 'none' }}
              />
              {storeResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.15)', borderRadius: 10, overflow: 'hidden', zIndex: 5 }}>
                  {storeResults.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => { setSelectedStore(s); setStoreQuery(''); setStoreResults([]) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', color: 'var(--fg-80)', fontSize: 12, cursor: 'pointer' }}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <span style={{ fontSize: 11, color: draft.length >= MAX_BODY ? '#FF4545' : '#4A5F50' }}>{draft.length}/{MAX_BODY}</span>
            <button
              className="action-btn"
              onClick={submitPost}
              disabled={!draft.trim() || posting}
              style={{ padding: '9px 20px', borderRadius: 10, border: 'none', backgroundColor: !draft.trim() || posting ? 'rgba(201,244,0,0.35)' : '#C9F400', color: '#0D1210', fontSize: 12, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', cursor: !draft.trim() || posting ? 'default' : 'pointer' }}
            >
              {posting ? '…' : 'Post'}
            </button>
          </div>
        </div>

        {/* Feed */}
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '56px 0' }}>
            <span style={{ fontSize: 40 }}>👥</span>
            <p style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase', letterSpacing: '0.02em' }}>No posts yet</p>
            <p style={{ fontSize: 13, color: '#7A8F80', textAlign: 'center' }}>Be the first to share something with the community.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, animation: 'fadeUp 0.5s ease 0.1s both' }}>
            {sorted.map((post) => (
              <div key={post.id} style={{ backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 16, padding: '13px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: 'rgba(201,244,0,0.12)', border: '1px solid rgba(201,244,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>{post.username[0]?.toUpperCase()}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>@{post.username}</span>
                      {topWeeklyIds.has(post.user_id) && (
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#ffd700', backgroundColor: 'rgba(255,215,0,0.12)', border: '1px solid rgba(255,215,0,0.3)', borderRadius: 6, padding: '2px 6px' }}>TOP 10</span>
                      )}
                    </div>
                    <span style={{ fontSize: 10.5, color: '#4A5F50' }}>{timeAgo(post.created_at)}</span>
                  </div>
                </div>

                {post.storeName && (
                  <button
                    onClick={() => router.push(`/store/${post.store_id}?name=${encodeURIComponent(post.storeName!)}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}
                  >
                    📍 {post.storeName}
                  </button>
                )}

                <p style={{ fontSize: 13, color: '#c9d0c2', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{post.body}</p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 11 }}>
                  <button
                    className="action-btn"
                    onClick={() => toggleLike(post)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: '4px 8px', borderRadius: 8, cursor: 'pointer', color: post.likedByMe ? 'var(--accent)' : '#7A8F80' }}
                  >
                    <span style={{ fontSize: 13 }}>{post.likedByMe ? '▲' : '△'}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{post.likeCount}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Trending stores */}
        {trendingStores.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', marginBottom: 10, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>
              Trending Stores This Week
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trendingStores.map((s) => (
                <button
                  key={s.id}
                  onClick={() => router.push(`/store/${s.id}?name=${encodeURIComponent(s.name)}`)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'var(--surface)', border: '1px solid rgba(201,244,0,0.12)', borderRadius: 14, padding: '12px 14px', cursor: 'pointer', textAlign: 'left' }}
                >
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{s.name}</p>
                    <p style={{ fontSize: 11, color: '#4A5F50', marginTop: 2 }}>{s.count} mention{s.count !== 1 ? 's' : ''} this week</p>
                  </div>
                  <span style={{ color: 'var(--accent)', fontSize: 18 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
