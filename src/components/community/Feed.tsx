'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isMissingSchema } from '@/lib/community'
import { TrendingIcon, ClockIcon, UsersIcon, PinIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'
import SkeletonList from '@/components/ui/SkeletonList'
import Composer from './Composer'
import PostCard from './PostCard'
import { milesBetween, trendingScore, type FeedComment, type FeedPost, type StoreSummary } from './types'
import { useAuth } from '@/contexts/AuthContext'
import { alertSlotsLeft, isAlertLimitError } from '@/lib/flavorAlerts'
import { FREE_ALERT_LIMIT, isTrackerProfile } from '@/lib/plans'
import UpgradeSheet, { ALERT_LIMIT_COPY } from '@/components/ui/UpgradeSheet'
import { shareLink } from '@/lib/share'
import { fetchProfileLites } from '@/lib/avatar'

const PAGE = 15
const NEAR_MILES = 10
type Filter = 'latest' | 'trending' | 'following' | 'near'
type Entry = { kind: 'post'; post: FeedPost; at: string }

const SELECT_V3 = 'id, user_id, store_id, body, photo_url, photo_urls, post_type, drink_id, quantity, created_at'
const SELECT_V2 = 'id, user_id, store_id, body, photo_url, created_at'

const REPORT_REASONS = ['Spam or ads', 'Harassment or hate', 'False or misleading info', 'Inappropriate photo', 'Something else']

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  return session ? { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` } : null
}

// The last feed this tab showed, kept in memory (not storage) so switching
// back to Community paints it instantly; refresh() then updates it quietly.
let feedCache: {
  uid: string; v3: boolean | null; posts: FeedPost[]; comments: Record<string, FeedComment[]>
  summaries: Record<string, StoreSummary>; cursor: string | null; hasMore: boolean
} | null = null

export default function Feed({ me, toast }: {
  me: { id: string; username: string; lat: number | null; lng: number | null }
  toast: (msg: string) => void
}) {
  const router = useRouter()
  // null = not detected yet. false = community-v3.sql not run (v3 features hidden).
  const cached = feedCache?.uid === me.id ? feedCache : null
  const [v3, setV3] = useState<boolean | null>(cached?.v3 ?? null)
  const v3Ref = useRef<boolean | null>(cached?.v3 ?? null)

  const [posts, setPosts] = useState<FeedPost[]>(cached?.posts ?? [])
  const [comments, setComments] = useState<Record<string, FeedComment[]>>(cached?.comments ?? {})
  const [summaries, setSummaries] = useState<Record<string, StoreSummary>>(cached?.summaries ?? {})
  const [cursor, setCursor] = useState<string | null>(cached?.cursor ?? null)
  const [hasMore, setHasMore] = useState(cached?.hasMore ?? true)
  const [loading, setLoading] = useState(!cached)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState<Filter>('latest')

  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set())
  const [topWeeklyIds, setTopWeeklyIds] = useState<Set<string>>(new Set())
  const [blockedIds, setBlockedIds] = useState<Set<string>>(new Set())
  const [followedDrinks, setFollowedDrinks] = useState<Set<string>>(new Set())
  const [newCount, setNewCount] = useState(0)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<{ post: FeedPost; comment?: FeedComment } | null>(null)
  const [pull, setPull] = useState(0)
  const { profile } = useAuth()
  const [alertLimitOpen, setAlertLimitOpen] = useState(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // ── Data ────────────────────────────────────────────────────────────
  const enrich = useCallback(async (rows: any[], isV3: boolean): Promise<{ posts: FeedPost[]; comments: Record<string, FeedComment[]> }> => {
    if (rows.length === 0) return { posts: [], comments: {} }
    const userIds = [...new Set(rows.map((p) => p.user_id))]
    const storeIds = [...new Set(rows.map((p) => p.store_id).filter(Boolean))] as string[]
    const drinkIds = isV3 ? [...new Set(rows.map((p) => p.drink_id).filter(Boolean))] as string[] : []
    const postIds = rows.map((p) => p.id)

    const commentQuery = (withV3: boolean) => supabase.from('community_post_comments')
      .select(withV3 ? 'id, post_id, user_id, body, created_at, parent_id, store_id' : 'id, post_id, user_id, body, created_at')
      .in('post_id', postIds).order('created_at', { ascending: true })

    const [profiles, { data: stores }, { data: drinks }, { data: likes }, commentsRes] = await Promise.all([
      fetchProfileLites(userIds),
      storeIds.length ? supabase.from('stores').select('id, name, address, lat, lng').in('id', storeIds) : Promise.resolve({ data: [] as any[] }),
      drinkIds.length ? supabase.from('drinks').select('id, brand, name, flavor').in('id', drinkIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from('community_post_likes').select('post_id, user_id').in('post_id', postIds),
      commentQuery(isV3),
    ])
    let commentRows: any[] = commentsRes.data ?? []
    if (commentsRes.error && isV3 && isMissingSchema(commentsRes.error)) commentRows = (await commentQuery(false)).data ?? []

    const commentUserIds = [...new Set(commentRows.map((c) => c.user_id))].filter((id) => !userIds.includes(id))
    const commentStoreIds = [...new Set(commentRows.map((c) => c.store_id).filter(Boolean))].filter((id) => !storeIds.includes(id as string)) as string[]
    const [extraProfiles, { data: extraStores }, { data: stock }] = await Promise.all([
      fetchProfileLites(commentUserIds),
      commentStoreIds.length ? supabase.from('stores').select('id, name').in('id', commentStoreIds) : Promise.resolve({ data: [] as any[] }),
      storeIds.length ? supabase.from('latest_stock').select('store_id, quantity, reported_at').in('store_id', storeIds) : Promise.resolve({ data: [] as any[] }),
    ])

    const people = new Map([...profiles, ...extraProfiles])
    const name = new Map([...people].map(([id, p]) => [id, p.username]))
    const storeById = new Map([...(stores ?? []), ...(extraStores ?? [])].map((s: any) => [s.id, s]))
    const drinkById = new Map((drinks ?? []).map((d: any) => [d.id, d]))
    const likeMap: Record<string, { n: number; mine: boolean }> = {}
    for (const l of likes ?? []) {
      const e = (likeMap[l.post_id] ??= { n: 0, mine: false })
      e.n++
      if (l.user_id === me.id) e.mine = true
    }

    const sums: Record<string, StoreSummary> = {}
    for (const r of stock ?? []) {
      const s = (sums[r.store_id] ??= { inStock: 0, total: 0, latest: null })
      s.total++
      if (r.quantity !== 'out') s.inStock++
      if (!s.latest || r.reported_at > s.latest) s.latest = r.reported_at
    }
    setSummaries((prev) => ({ ...prev, ...sums }))

    const byPost: Record<string, FeedComment[]> = {}
    for (const c of commentRows) {
      const st = c.store_id ? storeById.get(c.store_id) : null
      ;(byPost[c.post_id] ??= []).push({
        id: c.id, post_id: c.post_id, user_id: c.user_id, body: c.body, created_at: c.created_at,
        username: name.get(c.user_id) ?? 'someone', avatar: people.get(c.user_id)?.avatar ?? null, parent_id: c.parent_id ?? null,
        store: st ? { id: st.id, name: st.name } : null,
      })
    }

    return {
      comments: byPost,
      posts: rows.map((p) => {
        const st = p.store_id ? storeById.get(p.store_id) : null
        const d = p.drink_id ? drinkById.get(p.drink_id) : null
        const photos: string[] = Array.isArray(p.photo_urls) && p.photo_urls.length ? p.photo_urls : p.photo_url ? [p.photo_url] : []
        return {
          id: p.id, user_id: p.user_id, body: p.body, created_at: p.created_at,
          username: name.get(p.user_id) ?? 'someone',
          avatar: people.get(p.user_id)?.avatar ?? null,
          post_type: (p.post_type ?? 'post') as FeedPost['post_type'],
          photos,
          store: st ? { id: st.id, name: st.name, address: st.address ?? null, lat: st.lat ?? null, lng: st.lng ?? null } : null,
          drink: d ? { id: d.id, brand: d.brand, flavor: d.flavor || d.name } : null,
          quantity: p.quantity ?? null,
          likeCount: likeMap[p.id]?.n ?? 0,
          likedByMe: likeMap[p.id]?.mine ?? false,
        }
      }),
    }
  }, [me.id])

  const fetchRows = useCallback(async (before: string | null) => {
    const run = (withV3: boolean) => {
      let q = supabase.from('community_posts').select(withV3 ? SELECT_V3 : SELECT_V2).order('created_at', { ascending: false }).limit(PAGE)
      if (before) q = q.lt('created_at', before)
      if (withV3) q = q.is('hidden_at', null)
      return q
    }
    let useV3 = v3Ref.current ?? true
    let res = await run(useV3)
    if (res.error && useV3 && isMissingSchema(res.error)) { useV3 = false; res = await run(false) }
    if (v3Ref.current !== useV3) { v3Ref.current = useV3; setV3(useV3) }
    return { rows: (res.data ?? []) as any[], error: res.error, isV3: useV3 }
  }, [])

  const refresh = useCallback(async () => {
    setError(false)
    const { rows, error: err, isV3 } = await fetchRows(null)
    if (err) { setError(true); setLoading(false); return }
    const { posts: page, comments: cs } = await enrich(rows, isV3)
    setPosts(page)
    setComments(cs)
    setCursor(rows.length ? rows[rows.length - 1].created_at : null)
    setHasMore(rows.length === PAGE)
    setNewCount(0)
    setLoading(false)
  }, [fetchRows, enrich])

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !cursor) return
    setLoadingMore(true)
    const { rows, isV3 } = await fetchRows(cursor)
    const { posts: page, comments: cs } = await enrich(rows, isV3)
    setPosts((prev) => [...prev, ...page.filter((p) => !prev.some((q) => q.id === p.id))])
    setComments((prev) => ({ ...prev, ...cs }))
    setCursor(rows.length ? rows[rows.length - 1].created_at : cursor)
    setHasMore(rows.length === PAGE)
    setLoadingMore(false)
  }, [hasMore, loadingMore, cursor, fetchRows, enrich])

  useEffect(() => {
    if (loading) return
    feedCache = { uid: me.id, v3, posts, comments, summaries, cursor, hasMore }
  }, [me.id, loading, v3, posts, comments, summaries, cursor, hasMore])

  // Initial load + side data
  useEffect(() => {
    refresh()
    supabase.rpc('get_leaderboard', { p_timeframe: 'This Week' }).then(({ data }) => {
      if (data) setTopWeeklyIds(new Set(data.slice(0, 10).map((e: any) => e.id)))
    })
    supabase.from('follows').select('followed_id').eq('follower_id', me.id).then(({ data }) => {
      if (data) setFollowingIds(new Set(data.map((f: any) => f.followed_id)))
    })
    supabase.from('drink_alerts').select('drink_id').eq('user_id', me.id).then(({ data, error: e }) => {
      if (!e && data) setFollowedDrinks(new Set(data.map((a: any) => a.drink_id)))
    })
    supabase.from('user_blocks').select('blocked_id').eq('blocker_id', me.id).then(({ data, error: e }) => {
      if (!e && data) setBlockedIds(new Set(data.map((b: any) => b.blocked_id)))
    })
  }, [me.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Live "N new posts" pill (needs realtime on community_posts — community-v3.sql)
  useEffect(() => {
    const channel = supabase
      .channel('community-feed')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts' }, (payload: any) => {
        const uid = payload.new?.user_id
        if (uid && uid !== me.id) setNewCount((n) => n + 1)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me.id])

  // Infinite scroll
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) loadMore() }, { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [loadMore])

  // Pull to refresh (the app scrolls inside <main>)
  useEffect(() => {
    const main = document.querySelector('main')
    if (!main) return
    let startY: number | null = null
    let dist = 0
    const onStart = (e: TouchEvent) => { startY = main.scrollTop <= 0 ? e.touches[0].clientY : null; dist = 0 }
    const onMove = (e: TouchEvent) => {
      if (startY === null) return
      dist = Math.max(0, Math.min(90, (e.touches[0].clientY - startY) * 0.5))
      setPull(dist)
    }
    const onEnd = () => {
      if (startY !== null && dist >= 60) { setPull(60); refresh().finally(() => setPull(0)) }
      else setPull(0)
      startY = null
    }
    main.addEventListener('touchstart', onStart, { passive: true })
    main.addEventListener('touchmove', onMove, { passive: true })
    main.addEventListener('touchend', onEnd)
    return () => { main.removeEventListener('touchstart', onStart); main.removeEventListener('touchmove', onMove); main.removeEventListener('touchend', onEnd) }
  }, [refresh])

  // Shared-post deep link (?post=<id>): fetch it if it isn't already loaded.
  useEffect(() => {
    if (loading) return
    const postId = new URLSearchParams(window.location.search).get('post')
    if (!postId) return
    const show = () => {
      setHighlightId(postId)
      requestAnimationFrame(() => document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      setTimeout(() => setHighlightId(null), 3000)
    }
    if (posts.some((p) => p.id === postId)) { show(); return }
    ;(async () => {
      const isV3 = v3Ref.current ?? false
      const { data } = await supabase.from('community_posts').select(isV3 ? SELECT_V3 : SELECT_V2).eq('id', postId).maybeSingle()
      if (!data) return
      const { posts: one, comments: cs } = await enrich([data], isV3)
      setPosts((prev) => [...one, ...prev.filter((p) => p.id !== postId)])
      setComments((prev) => ({ ...prev, ...cs }))
      show()
    })()
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ─────────────────────────────────────────────────────────
  async function toggleLike(post: FeedPost) {
    const next = !post.likedByMe
    const apply = (liked: boolean) => setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, likedByMe: liked, likeCount: p.likeCount + (liked ? 1 : -1) } : p))
    apply(next)
    const headers = await authHeaders()
    const ok = headers && (await fetch('/api/community/like', { method: 'POST', headers, body: JSON.stringify({ post_id: post.id, liked: next }) }).then((r) => r.ok).catch(() => false))
    if (!ok) { apply(!next); toast('Could not update like. Try again.') }
  }

  async function toggleFollow(userId: string) {
    const next = !followingIds.has(userId)
    const apply = (on: boolean) => setFollowingIds((prev) => { const s = new Set(prev); on ? s.add(userId) : s.delete(userId); return s })
    apply(next)
    const headers = await authHeaders()
    const ok = headers && (await fetch('/api/community/follow', { method: 'POST', headers, body: JSON.stringify({ user_id: userId, following: next }) }).then((r) => r.ok).catch(() => false))
    if (!ok) { apply(!next); toast('Could not update follow. Try again.') }
  }

  async function followDrink(drinkId: string) {
    if ((await alertSlotsLeft(me.id, isTrackerProfile(profile))) <= 0) { setAlertLimitOpen(true); return }
    setFollowedDrinks((prev) => new Set(prev).add(drinkId))
    const { error: e } = await supabase.from('drink_alerts').upsert({ user_id: me.id, drink_id: drinkId, scope: 'anywhere' }, { onConflict: 'user_id,drink_id' })
    if (e) {
      setFollowedDrinks((prev) => { const s = new Set(prev); s.delete(drinkId); return s })
      if (isAlertLimitError(e)) setAlertLimitOpen(true)
      else toast('Could not follow that flavor.')
    }
    else toast("Following. You'll be alerted when it restocks.")
  }

  async function share(post: FeedPost) {
    // /p/[id] carries the post's own link preview image and a public copy.
    const url = `${window.location.origin}/p/${post.id}`
    const r = await shareLink({ url, text: `@${post.username} on AmpedMap: ${post.body}`.slice(0, 200) })
    if (r === 'copied') toast('Link copied!')
    else if (r === 'failed') toast('Could not copy link.')
  }

  async function deletePost(post: FeedPost) {
    if (!window.confirm('Delete this post? This can’t be undone.')) return
    const { error: e } = await supabase.from('community_posts').delete().eq('id', post.id)
    if (e) { toast('Could not delete post.'); return }
    setPosts((prev) => prev.filter((p) => p.id !== post.id))
    toast('Post deleted')
  }

  async function addComment(postId: string, body: string, parentId: string | null, store: { id: string; name: string } | null) {
    const headers = await authHeaders()
    if (!headers) { toast('Session expired. Please sign in again.'); return false }
    const res = await fetch('/api/community/comment', { method: 'POST', headers, body: JSON.stringify({ post_id: postId, body, parent_id: parentId, store_id: store?.id ?? null }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok || !json.comment) { toast(json.error ?? 'Could not add comment.'); return false }
    setComments((prev) => ({
      ...prev,
      [postId]: [...(prev[postId] ?? []), { ...json.comment, username: me.username, parent_id: json.comment.parent_id ?? null, store }],
    }))
    return true
  }

  async function deleteComment(c: FeedComment) {
    if (!window.confirm('Delete this comment?')) return
    const { error: e } = await supabase.from('community_post_comments').delete().eq('id', c.id)
    if (e) { toast('Could not delete comment.'); return }
    setComments((prev) => ({ ...prev, [c.post_id]: (prev[c.post_id] ?? []).filter((x) => x.id !== c.id && x.parent_id !== c.id) }))
  }

  async function submitReport(reason: string) {
    if (!reportTarget) return
    const { post, comment } = reportTarget
    setReportTarget(null)
    const { error: e } = await supabase.from('community_reports').insert({ post_id: post.id, comment_id: comment?.id ?? null, reporter_id: me.id, reason })
    if (e && e.code !== '23505') { toast('Could not send report. Try again.'); return }
    toast('Thanks. Our team will take a look.')
  }

  async function blockUser(userId: string, username: string) {
    if (!window.confirm(`Block @${username}? You won’t see their posts or comments.`)) return
    const { error: e } = await supabase.from('user_blocks').insert({ blocker_id: me.id, blocked_id: userId })
    if (e && e.code !== '23505') { toast('Could not block. Try again.'); return }
    setBlockedIds((prev) => new Set(prev).add(userId))
    toast(`Blocked @${username}`)
  }

  // ── View model ──────────────────────────────────────────────────────
  const visiblePosts = useMemo(() => posts.filter((p) => !blockedIds.has(p.user_id)), [posts, blockedIds])
  const visibleComments = useCallback((postId: string) => (comments[postId] ?? []).filter((c) => !blockedIds.has(c.user_id)), [comments, blockedIds])
  const hasLocation = me.lat != null && me.lng != null

  const entries: Entry[] = useMemo(() => {
    const postEntries = (list: FeedPost[]): Entry[] => list.map((post) => ({ kind: 'post', post, at: post.created_at }))
    if (filter === 'trending') {
      return postEntries([...visiblePosts].sort((a, b) => trendingScore(b, visibleComments(b.id).length) - trendingScore(a, visibleComments(a.id).length)))
    }
    if (filter === 'following') return postEntries(visiblePosts.filter((p) => followingIds.has(p.user_id)))
    let list = visiblePosts
    if (filter === 'near') {
      if (!hasLocation) return []
      list = visiblePosts.filter((p) => p.store?.lat != null && p.store?.lng != null && milesBetween(me.lat!, me.lng!, p.store.lat, p.store.lng) <= NEAR_MILES)
    }
    return postEntries(list)
  }, [filter, visiblePosts, followingIds, hasLocation, me.lat, me.lng, visibleComments])

  const hotStores = useMemo(() => {
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const counts = new Map<string, { id: string; name: string; n: number }>()
    const bump = (id: string, name: string) => { const e = counts.get(id) ?? { id, name, n: 0 }; e.n++; counts.set(id, e) }
    visiblePosts.forEach((p) => { if (p.store && p.created_at >= weekAgo) bump(p.store.id, p.store.name) })
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8)
  }, [visiblePosts])

  const FILTERS: { key: Filter; label: string; Icon: typeof ClockIcon }[] = [
    { key: 'latest', label: 'Latest', Icon: ClockIcon },
    { key: 'trending', label: 'Trending', Icon: TrendingIcon },
    { key: 'following', label: 'Following', Icon: UsersIcon },
    { key: 'near', label: 'Near me', Icon: PinIcon },
  ]

  return (
    <div style={{ position: 'relative' }}>
      {/* Pull-to-refresh indicator */}
      <div style={{ height: pull, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: pull === 0 ? 'height 0.2s ease' : 'none' }}>
        <div style={{ width: 22, height: 22, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: pull >= 60 ? 'spin 0.8s linear infinite' : 'none', transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / 60) }} />
      </div>

      {/* New posts pill */}
      {newCount > 0 && (
        <div style={{ position: 'sticky', top: 'calc(env(safe-area-inset-top) + 8px)', zIndex: 15, display: 'flex', justifyContent: 'center', height: 0 }}>
          <button className={`${ui.btnPrimary} anim-rise`} style={{ minHeight: 36, padding: '6px 16px', fontSize: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}
            onClick={async () => { document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' }); await refresh() }}>
            ↑ {newCount} new post{newCount === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {/* Filters */}
      <div className={ui.chipRow} style={{ marginBottom: 12 }}>
        {FILTERS.map(({ key, label, Icon }) => (
          <button key={key} className={`${ui.chip} ${filter === key ? ui.chipActive : ''}`} onClick={() => setFilter(key)}>
            <Icon size={13} color={filter === key ? '#0D1210' : 'var(--text-muted)'} />{label}
          </button>
        ))}
      </div>

      {/* Hot stores */}
      {hotStores.length > 0 && filter !== 'following' && (
        <div style={{ marginBottom: 14 }}>
          <p className={ui.sectionLabel} style={{ marginBottom: 8 }}>Hot stores this week</p>
          <div className={ui.chipRow}>
            {hotStores.map((s) => (
              <button key={s.id} className={ui.chip} onClick={() => router.push(`/store/${s.id}?name=${encodeURIComponent(s.name)}`)}>
                <PinIcon size={12} color="var(--accent)" />{s.name}<span style={{ color: 'var(--text-dim)' }}>{s.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <Composer username={me.username} v3={!!v3} toast={toast} onPosted={() => { refresh() }} />
      </div>

      {loading ? (
        <SkeletonList count={4} />
      ) : error ? (
        <div className={ui.emptyState}>
          <UsersIcon size={36} color="var(--text-dim)" />
          <p className={ui.emptyTitle}>Couldn&apos;t load the feed</p>
          <p className={ui.emptyBody}>Check your connection and try again.</p>
          <button className={ui.btnSecondary} style={{ marginTop: 6 }} onClick={() => { setLoading(true); refresh() }}>Try again</button>
        </div>
      ) : entries.length === 0 ? (
        <div className={ui.emptyState}>
          {filter === 'near' ? <PinIcon size={36} color="var(--text-dim)" /> : <UsersIcon size={36} color="var(--text-dim)" />}
          <p className={ui.emptyTitle}>
            {filter === 'following' ? 'Not following anyone yet' : filter === 'near' ? (hasLocation ? 'Nothing nearby yet' : 'Location needed') : 'No posts yet'}
          </p>
          <p className={ui.emptyBody}>
            {filter === 'following' ? 'Follow people from their posts or profiles to see them here.'
              : filter === 'near' ? (hasLocation ? 'No posts about stores within 10 miles yet. Be the first.' : 'Open the map once so we know where “near you” is.')
              : 'Be the first to share something with the community.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((e) => (
              <PostCard
                key={e.post.id}
                post={e.post}
                comments={visibleComments(e.post.id)}
                meId={me.id}
                v3={!!v3}
                storeSummary={e.post.store ? summaries[e.post.store.id] : undefined}
                highlighted={highlightId === e.post.id}
                topWeekly={topWeeklyIds.has(e.post.user_id)}
                isFollowing={followingIds.has(e.post.user_id)}
                drinkFollowed={!!e.post.drink && followedDrinks.has(e.post.drink.id)}
                onToggleLike={toggleLike}
                onToggleFollow={toggleFollow}
                onFollowDrink={followDrink}
                onShare={share}
                onDelete={deletePost}
                onReport={(post, comment) => setReportTarget({ post, comment })}
                onBlock={blockUser}
                onComment={addComment}
                onDeleteComment={deleteComment}
              />
            ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} style={{ height: 1 }} />
      {loadingMore && <div style={{ marginTop: 10 }}><SkeletonList count={2} /></div>}
      {!loading && !hasMore && visiblePosts.length > 0 && (
        <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-dim)', margin: '20px 0 0' }}>You&apos;re all caught up</p>
      )}

      {/* Report sheet */}
      {reportTarget && createPortal(
        <div className="anim-fade" onClick={() => setReportTarget(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end' }}>
          <div className="anim-sheet" onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: 'var(--surface)', borderRadius: '24px 24px 0 0', border: '1px solid var(--fg-08)', padding: '18px 16px calc(env(safe-area-inset-bottom) + 20px)' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--fg-20)', margin: '0 auto 16px' }} />
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Report {reportTarget.comment ? 'comment' : 'post'}</p>
            <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 14 }}>What&apos;s wrong with it?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {REPORT_REASONS.map((r) => <button key={r} className={ui.btnSecondary} style={{ justifyContent: 'flex-start' }} onClick={() => submitReport(r)}>{r}</button>)}
              <button className={ui.btnGhost} onClick={() => setReportTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {alertLimitOpen && <UpgradeSheet {...ALERT_LIMIT_COPY(FREE_ALERT_LIMIT)} onClose={() => setAlertLimitOpen(false)} />}
    </div>
  )
}
