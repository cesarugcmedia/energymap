'use client'

import { use, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isMissingSchema } from '@/lib/community'
import { useAuth } from '@/contexts/AuthContext'
import Toast from '@/components/Toast'
import BackButton from '@/components/BackButton'
import SkeletonList from '@/components/ui/SkeletonList'
import ui from '@/components/ui/ui.module.css'
import CountUp from '@/components/ui/CountUp'
import { CheckIcon, PinIcon, UsersIcon, StoreTypeIcon, ChevronRightIcon, DrinkIcon } from '@/components/Icons'
import { BADGE_DEFS } from '@/lib/badges'
import { Avatar, RichText } from '@/components/community/RichText'
import { timeAgo } from '@/components/community/types'
import PeopleSheet from '@/components/community/PeopleSheet'
import FollowButton from '@/components/community/FollowButton'
import { useIsLive } from '@/contexts/PresenceContext'
import FlavorCollection from '@/components/community/FlavorCollection'
import SlideHighlight from '@/components/ui/SlideHighlight'
import ProfilePhoto from '@/components/account/ProfilePhoto'
import ProfileExtras from '@/components/account/ProfileExtras'

type ProfileData = {
  profile: { id: string; username: string; joined: string; verified: boolean; weeklyChampion: boolean; bio?: string | null; favoriteDrink?: string | null; avatarUrl?: string | null }
  counts: { reports: number; storesAdded: number; followers: number; following: number }
  following: boolean
  stats?: { uniqueFlavors: number; streak: number }
  badges?: string[]
  topStores?: { id: string; name: string; type: string; reports: number }[]
  recentFinds?: { drink: string; quantity: string; storeId: string; storeName: string; at: string }[]
  collection?: { found: string[]; permanent: boolean }
  privateReports?: boolean
}
type Tab = 'posts' | 'finds' | 'collection'
const TABS: { key: Tab; label: string }[] = [
  { key: 'posts', label: 'Posts' }, { key: 'finds', label: 'Finds' }, { key: 'collection', label: 'Collection' },
]
type MiniPost = { id: string; body: string; created_at: string; photo: string | null; storeName: string | null; likes: number; type: string }

// Public profile: who they are, what they've contributed, their posts.
export default function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params)
  const router = useRouter()
  const { user, loading: authLoading, refreshProfile } = useAuth()
  // Your own profile opens as everyone else sees it; Edit profile swaps in
  // the editor and Save brings you back to the public view.
  const [editing, setEditing] = useState(false)
  const [data, setData] = useState<ProfileData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [posts, setPosts] = useState<MiniPost[] | null>(null)
  const [following, setFollowing] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [peopleList, setPeopleList] = useState<'followers' | 'following' | null>(null)
  const [tab, setTab] = useState<Tab>('posts')
  // Swipe left/right on the tab content to move between tabs; the content
  // slides in from the side you're heading.
  const [tabDir, setTabDir] = useState<'next' | 'back' | null>(null)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const goTab = (next: Tab) => {
    const from = TABS.findIndex((t) => t.key === tab)
    const to = TABS.findIndex((t) => t.key === next)
    if (from === to) return
    setTabDir(to > from ? 'next' : 'back')
    setTab(next)
  }
  const onSwipeStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    // Leave the screen's left edge to the phone's own back gesture.
    swipe.current = t.clientX < 24 ? null : { x: t.clientX, y: t.clientY }
  }
  const onSwipeEnd = (e: React.TouchEvent) => {
    const start = swipe.current
    swipe.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return
    const i = TABS.findIndex((x) => x.key === tab)
    const next = TABS[i + (dx < 0 ? 1 : -1)]
    if (next) goTab(next.key)
  }
  const [blocksEnabled, setBlocksEnabled] = useState(false)
  const [toast, setToast] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const showToast = (m: string) => { setToast(m); setToastVisible(true); setTimeout(() => setToastVisible(false), 2500) }

  useEffect(() => { if (!authLoading && !user) router.replace('/account') }, [user, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return
    setTab('posts')
    setTabDir(null)
    setEditing(false)
    setData(null)
    setPosts(null)
    setNotFound(false)
    setBlocked(false)
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`/api/community/profile?username=${encodeURIComponent(username)}&tz=${new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
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

  async function reloadProfile() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const res = await fetch(`/api/community/profile?username=${encodeURIComponent(username)}&tz=${new Date().getTimezoneOffset()}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (res.ok) setData(await res.json())
  }

  function startEditing() {
    setEditing(true)
    document.querySelector('main')?.scrollTo({ top: 0 })
    window.scrollTo(0, 0)
  }

  async function finishEditing() {
    await reloadProfile()
    setEditing(false)
    showToast('Profile saved')
  }

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

  // Share sheet on phones, copy-the-link elsewhere. The link unfurls into a
  // preview card (src/app/u/[username]/opengraph-image.tsx).
  async function shareProfile() {
    if (!data) return
    const url = `${window.location.origin}/u/${data.profile.username}`
    const text = isMe ? 'Find me on AmpedMap' : `@${data.profile.username} on AmpedMap`
    if (navigator.share) {
      try { await navigator.share({ title: text, url }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
    }
    try { await navigator.clipboard.writeText(url); showToast('Profile link copied') } catch { showToast(url) }
  }

  const isMe = data?.profile.id === user?.id
  const isLive = useIsLive(data?.profile.id)
  const stat = (n: number, label: string, onTap?: () => void) => {
    const inner = (
      <>
        <p style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}><CountUp value={n} /></p>
        <p style={{ fontSize: 13, color: onTap ? 'var(--text-muted)' : 'var(--text-dim)' }}>{label}</p>
      </>
    )
    return onTap
      ? <button onClick={onTap} style={{ flex: 1, textAlign: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>{inner}</button>
      : <div style={{ flex: 1, textAlign: 'center' }}>{inner}</div>
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
      <Toast message={toast} visible={toastVisible} />
      {peopleList && data && (
        <PeopleSheet
          mode={peopleList}
          userId={data.profile.id}
          username={data.profile.username}
          onClose={() => setPeopleList(null)}
          // Following someone from my own Following/Followers list changes my "Following" count.
          onFollowChange={(d) => { if (isMe) setData((cur) => cur && { ...cur, counts: { ...cur.counts, following: cur.counts.following + d } }) }}
        />
      )}
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
        ) : editing && isMe ? (
          <div className="anim-fade">
            <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 18 }}>Edit profile</h1>
            <div style={{ marginBottom: 22 }}>
              <ProfilePhoto userId={data.profile.id} username={data.profile.username} url={data.profile.avatarUrl ?? null}
                onChange={async () => { await refreshProfile(); await reloadProfile() }} />
            </div>
            <ProfileExtras userId={data.profile.id} onSaved={finishEditing} onCancel={() => setEditing(false)} />
            <Link href="/account?page=username" className={ui.card} style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'inherit' }}>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: 15, color: 'var(--text)' }}>Username</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 1 }}>@{data.profile.username}</span>
              </span>
              <ChevronRightIcon size={16} color="var(--text-dim)" />
            </Link>
          </div>
        ) : (
          <>
            <div className="anim-rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '8px 0 20px' }}>
              <Avatar name={data.profile.username} url={data.profile.avatarUrl} userId={data.profile.id} size={88} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700 }}>@{data.profile.username}</h1>
                {data.profile.verified && <CheckIcon size={16} color="#60a5fa" />}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                {isLive && !isMe && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accent-text)', background: 'rgba(201,244,0,0.12)', borderRadius: 8, padding: '3px 8px' }}><span className="live-dot" style={{ width: 7, height: 7, borderRadius: '50%', background: '#C9F400' }} /> Live now</span>}
                {data.profile.weeklyChampion && <span style={{ fontSize: 12, fontWeight: 700, color: '#ffd700', background: 'rgba(255,215,0,0.12)', borderRadius: 8, padding: '3px 8px' }}>👑 Weekly champion</span>}
                {(data.stats?.streak ?? 0) >= 2 && <span style={{ fontSize: 12, fontWeight: 700, color: '#FF8A3D', background: 'rgba(255,138,61,0.12)', borderRadius: 8, padding: '3px 8px' }}><span className="flame">🔥</span> {data.stats!.streak}-day streak</span>}
              </div>
              {data.profile.bio && <p style={{ fontSize: 15, color: 'var(--text)', textAlign: 'center', maxWidth: 360, lineHeight: 1.45 }}>{data.profile.bio}</p>}
              {data.profile.favoriteDrink && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', background: 'rgba(201,244,0,0.1)', borderRadius: 999, padding: '4px 10px' }}>
                  <DrinkIcon size={13} color="var(--accent-text)" /> Favorite: {data.profile.favoriteDrink}
                </span>
              )}
              {data.profile.joined && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Joined {new Date(data.profile.joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {!isMe && <FollowButton following={following} onToggle={toggleFollow} disabled={blocked} />}
                {isMe && <button className={ui.btnPrimary} onClick={startEditing}>Edit profile</button>}
                <button className={ui.btnSecondary} onClick={shareProfile} style={{ gap: 6 }}><ShareIcon /> Share</button>
                {!isMe && blocksEnabled && <button className={ui.btnGhost} onClick={toggleBlock}>{blocked ? 'Unblock' : 'Block'}</button>}
              </div>
            </div>

            <div className={`${ui.card} anim-rise`} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', rowGap: 16, padding: '16px 8px', marginBottom: 22 }}>
              {stat(data.counts.reports, 'Reports')}
              {stat(data.stats?.uniqueFlavors ?? 0, 'Flavors found')}
              {stat(data.counts.storesAdded, 'Stores added')}
              {stat(data.counts.followers, 'Followers', () => setPeopleList('followers'))}
              {stat(data.counts.following, 'Following', () => setPeopleList('following'))}
              {stat(data.badges?.length ?? 0, 'Badges')}
            </div>

            {/* Badges */}
            {data.badges && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 10px' }}>
                  <p className={ui.sectionLabel} style={{ margin: 0 }}>Badges</p>
                  <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{data.badges.length} of {BADGE_DEFS.length}</span>
                </div>
                {data.badges.length === 0 ? (
                  <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>{isMe ? 'Report stock to earn your first badge.' : 'No badges yet.'}</p>
                ) : (
                  <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
                    {BADGE_DEFS.filter((b) => data.badges!.includes(b.id)).map((b, i) => (
                      <div key={b.id} title={b.desc} className="reveal shine" style={{ ['--shine-delay' as string]: `${0.4 + i * 0.12}s`, flexShrink: 0, width: 92, borderRadius: 14, padding: '12px 6px', textAlign: 'center', background: 'var(--surface)', border: `1px solid ${b.color}40` }}>
                        <div style={{ fontSize: 26, lineHeight: 1 }}>{b.icon}</div>
                        <p style={{ fontSize: 12, fontWeight: 600, color: b.color, marginTop: 6, lineHeight: 1.2 }}>{b.name}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tabs */}
            <div className={`${ui.segmented} ${ui.segSlide}`} style={{ display: 'flex', marginBottom: 16 }} role="tablist">
              <SlideHighlight activeKey={tab} />
              {TABS.map((t) => (
                <button key={t.key} role="tab" aria-selected={tab === t.key} data-active={tab === t.key}
                  className={`${ui.segment} ${tab === t.key ? ui.segmentActive : ''}`} style={{ flex: 1 }} onClick={() => goTab(t.key)}>
                  {t.label}
                </button>
              ))}
            </div>

            <div key={tab} className={tabDir === 'next' ? 'slide-next' : tabDir === 'back' ? 'slide-back' : undefined} onTouchStart={onSwipeStart} onTouchEnd={onSwipeEnd} style={{ minHeight: 240 }}>
            {blocked && tab !== 'collection' ? (
              <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>You blocked this user. Unblock to see their activity.</p>
            ) : tab === 'finds' ? (
              <div key="finds" className="anim-fade">
                {data.privateReports ? (
                  <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>@{data.profile.username} keeps their reports private.</p>
                ) : (!data.recentFinds?.length && !data.topStores?.length) ? (
                  <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>{isMe ? 'Your in-stock reports will show up here.' : 'No recent finds.'}</p>
                ) : (
                  <>
                    {!!data.recentFinds?.length && (
                      <div style={{ marginBottom: 22 }}>
                        <p className={ui.sectionLabel} style={{ margin: '0 2px 10px' }}>Recent finds</p>
                        <div className={`${ui.card} reveal`} style={{ padding: 0, overflow: 'hidden' }}>
                          {data.recentFinds.map((f, i) => (
                            <Link key={`${f.storeId}-${f.at}-${i}`} href={`/store/${f.storeId}?name=${encodeURIComponent(f.storeName)}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderTop: i ? '1px solid var(--fg-06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: f.quantity === 'full' ? '#C9F400' : f.quantity === 'medium' ? '#FFB300' : '#FF8A3D' }} />
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.drink}</span>
                                <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {f.quantity === 'full' ? 'Full' : f.quantity === 'medium' ? 'Medium' : 'Low'} · {f.storeName} · {timeAgo(f.at)}
                                </span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                    {!!data.topStores?.length && (
                      <div style={{ marginBottom: 22 }}>
                        <p className={ui.sectionLabel} style={{ margin: '0 2px 10px' }}>Reports most at</p>
                        <div className={`${ui.card} reveal`} style={{ padding: 0, overflow: 'hidden' }}>
                          {data.topStores.map((st, i) => (
                            <Link key={st.id} href={`/store/${st.id}?name=${encodeURIComponent(st.name)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--fg-06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <StoreTypeIcon type={st.type} size={18} color="var(--text-muted)" />
                              </span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}</span>
                              <span style={{ fontSize: 13, color: 'var(--text-dim)', flexShrink: 0 }}>{st.reports} report{st.reports === 1 ? '' : 's'}</span>
                              <ChevronRightIcon size={16} color="var(--text-dim)" />
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : tab === 'collection' ? (
              <div key="collection" className="anim-fade">
                <FlavorCollection found={data.collection?.found ?? []} isMe={isMe} />
              </div>
            ) : posts === null ? (
              <SkeletonList count={2} />
            ) : posts.length === 0 ? (
              <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>{isMe ? 'You haven’t posted yet.' : 'No posts yet.'}</p>
            ) : (
              <div key="posts" className="anim-fade" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {posts.map((post) => (
                  <Link key={post.id} href={`/community?post=${post.id}`} className={`${ui.card} reveal`} style={{ display: 'flex', gap: 12, textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {post.type !== 'post' && <span style={{ fontSize: 12, fontWeight: 700, color: post.type === 'found' ? 'var(--accent-text)' : '#FFB300' }}>{post.type === 'found' ? 'Found it' : 'Looking for'}</span>}
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
            </div>
          </>
        )}
      </div>
    </div>
  )
}


function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" /><path d="m7 8 5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  )
}
