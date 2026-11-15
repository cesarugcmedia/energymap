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
import CountUp from '@/components/ui/CountUp'
import { CheckIcon, PinIcon, UsersIcon, StoreTypeIcon, ChevronRightIcon, DrinkIcon } from '@/components/Icons'
import { BADGE_DEFS } from '@/lib/badges'
import { Avatar, RichText } from '@/components/community/RichText'
import { timeAgo } from '@/components/community/types'
import PeopleSheet from '@/components/community/PeopleSheet'

type ProfileData = {
  profile: { id: string; username: string; joined: string; verified: boolean; weeklyChampion: boolean; bio?: string | null; favoriteDrink?: string | null }
  counts: { reports: number; storesAdded: number; followers: number; following: number }
  following: boolean
  stats?: { uniqueFlavors: number; streak: number }
  badges?: string[]
  topStores?: { id: string; name: string; type: string; reports: number }[]
  recentFinds?: { drink: string; quantity: string; storeId: string; storeName: string; at: string }[]
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
  const [peopleList, setPeopleList] = useState<'followers' | 'following' | null>(null)
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
                {(data.stats?.streak ?? 0) >= 2 && <span style={{ fontSize: 12, fontWeight: 700, color: '#FF8A3D', background: 'rgba(255,138,61,0.12)', borderRadius: 8, padding: '3px 8px' }}><span className="flame">🔥</span> {data.stats!.streak}-day streak</span>}
              </div>
              {data.profile.bio && <p style={{ fontSize: 15, color: 'var(--text)', textAlign: 'center', maxWidth: 360, lineHeight: 1.45 }}>{data.profile.bio}</p>}
              {data.profile.favoriteDrink && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--accent-text)', background: 'rgba(201,244,0,0.1)', borderRadius: 999, padding: '4px 10px' }}>
                  <DrinkIcon size={13} color="var(--accent-text)" /> Favorite: {data.profile.favoriteDrink}
                </span>
              )}
              {data.profile.joined && <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>Joined {new Date(data.profile.joined).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>}
              {!isMe && (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button className={following ? ui.btnSecondary : ui.btnPrimary} onClick={toggleFollow} disabled={blocked}>{following ? 'Following' : 'Follow'}</button>
                  {blocksEnabled && <button className={ui.btnGhost} onClick={toggleBlock}>{blocked ? 'Unblock' : 'Block'}</button>}
                </div>
              )}
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

            {/* Recent finds */}
            {!blocked && data.recentFinds && data.recentFinds.length > 0 && (
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

            {/* Favorite stores */}
            {!blocked && data.topStores && data.topStores.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <p className={ui.sectionLabel} style={{ margin: '0 2px 10px' }}>Reports most at</p>
                <div className={`${ui.card} reveal`} style={{ padding: 0, overflow: 'hidden' }}>
                  {data.topStores.map((s, i) => (
                    <Link key={s.id} href={`/store/${s.id}?name=${encodeURIComponent(s.name)}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? '1px solid var(--fg-06)' : 'none', textDecoration: 'none', color: 'inherit' }}>
                      <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <StoreTypeIcon type={s.type} size={18} color="var(--text-muted)" />
                      </span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-dim)', flexShrink: 0 }}>{s.reports} report{s.reports === 1 ? '' : 's'}</span>
                      <ChevronRightIcon size={16} color="var(--text-dim)" />
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <p className={ui.sectionLabel}>Posts</p>
            {blocked ? (
              <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>You blocked this user. Unblock to see their posts.</p>
            ) : posts === null ? (
              <SkeletonList count={2} />
            ) : posts.length === 0 ? (
              <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>{isMe ? 'You haven’t posted yet.' : 'No posts yet.'}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
          </>
        )}
      </div>
    </div>
  )
}
