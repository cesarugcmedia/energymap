'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import Toast from '@/components/Toast'
import Feed from '@/components/community/Feed'
import { ClipboardIcon, TrophyIcon, CheckIcon, LightningIcon, GroceryIcon, DrinkIcon } from '@/components/Icons'

type MainView = 'feed' | 'leaderboard'

const TIMEFRAMES = ['All Time', 'This Month', 'This Week']

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
const RANK_COLOR: Record<number, { text: string; border: string; bg: string }> = {
  1: { text: '#ffd700', border: 'rgba(255,215,0,0.2)',   bg: 'rgba(255,215,0,0.05)'   },
  2: { text: '#c0c0c0', border: 'rgba(192,192,192,0.15)', bg: 'rgba(192,192,192,0.04)' },
  3: { text: '#cd7f32', border: 'rgba(205,127,50,0.15)',  bg: 'rgba(205,127,50,0.04)'  },
}

const AVATAR_COLORS = [
  'linear-gradient(135deg, #C9F400, #8FB800)',
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #a855f7, #7c3aed)',
  'linear-gradient(135deg, #f97316, #ea580c)',
  'linear-gradient(135deg, #ec4899, #be185d)',
  'linear-gradient(135deg, #06b6d4, #0284c7)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
  'linear-gradient(135deg, #FF4545, #cc0000)',
]

// Community tab: the Feed (src/components/community/Feed.tsx) and the
// Leaderboard, switched by a sub-toggle under the header.
export default function CommunityPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  const [mainView, setMainView] = useState<MainView>('feed')
  const [lbEntries, setLbEntries] = useState<any[]>([])
  const [lbLoading, setLbLoading] = useState(false)
  const [lbFetchError, setLbFetchError] = useState(false)
  const [lbTimeframe, setLbTimeframe] = useState('All Time')

  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  function showToast(message: string) {
    setToastMessage(message)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2800)
  }

  // Lets the old /leaderboard route (now a redirect) land on the Leaderboard sub-tab.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'leaderboard') setMainView('leaderboard')
  }, [])

  // Leaderboard data is fetched lazily, only once that sub-tab is opened.
  useEffect(() => {
    if (mainView !== 'leaderboard' || !user) return
    setLbLoading(true)
    setLbFetchError(false)
    supabase
      .rpc('get_leaderboard', { p_timeframe: lbTimeframe })
      .then(({ data, error }) => {
        if (error) { setLbFetchError(true) } else if (data) { setLbEntries(data) }
        setLbLoading(false)
      })
  }, [mainView, lbTimeframe, user])

  if (authLoading || !user) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', backgroundColor: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const p = profile as any
  const me = {
    id: user.id,
    username: profile?.username ?? 'you',
    lat: typeof p?.last_lat === 'number' ? p.last_lat : null,
    lng: typeof p?.last_lng === 'number' ? p.last_lng : null,
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden', position: 'relative', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <style>{`.pill-btn { transition: all 0.15s ease; cursor: pointer; }`}</style>
      <Toast message={toastMessage} visible={toastVisible} />

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px 100px' }}>

        {/* Header */}
        <div style={{ padding: '12px 0 16px' }}>
          <h1 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>Community</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Finds, questions and live reports from hunters near you</p>
        </div>

        {/* Feed / Leaderboard sub-tabs */}
        <div style={{ display: 'flex', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 4, gap: 4, marginBottom: 14 }}>
          {([
            { view: 'feed' as MainView, label: 'Feed', icon: ClipboardIcon },
            { view: 'leaderboard' as MainView, label: 'Leaderboard', icon: TrophyIcon },
          ]).map(({ view, label, icon: Icon }) => {
            const active = mainView === view
            const color = active ? '#0D1210' : 'var(--text-muted)'
            return (
              <button key={view} className="pill-btn"
                onClick={() => setMainView(view)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600, backgroundColor: active ? '#C9F400' : 'transparent', color, fontFamily: 'inherit' }}>
                <Icon size={14} color={color} />
                {label}
              </button>
            )
          })}
        </div>

        {mainView === 'feed' && <Feed me={me} toast={showToast} />}

        {mainView === 'leaderboard' && (() => {
          const myEntry = lbEntries.find((e) => e.id === user.id)
          const myRank = myEntry ? lbEntries.indexOf(myEntry) + 1 : null
          return (
            <>
              {/* Timeframe tabs */}
              <div style={{ display: 'flex', backgroundColor: 'var(--surface)', borderRadius: 12, padding: 3, border: '1px solid var(--border)', marginBottom: 16 }}>
                {TIMEFRAMES.map((tf) => (
                  <button key={tf} className="pill-btn"
                    onClick={() => setLbTimeframe(tf)}
                    style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, backgroundColor: lbTimeframe === tf ? '#C9F400' : 'transparent', color: lbTimeframe === tf ? '#0D1210' : 'var(--text-dim)' }}>
                    {tf}
                  </button>
                ))}
              </div>

              {/* My Rank Banner */}
              {myEntry && myRank && (
                <div style={{ backgroundColor: 'rgba(201,244,0,0.06)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#C9F400' }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--accent)' }}>Your Rank</span>
                  </div>
                  <div style={{ width: 1, height: 16, backgroundColor: 'rgba(201,244,0,0.12)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: AVATAR_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#0D1210', flexShrink: 0 }}>
                      {(myEntry.username as string)[0].toUpperCase()}
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>#{myRank} · {myEntry.points} pts</span>
                  </div>
                </div>
              )}

              {lbLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
                  <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              ) : lbFetchError ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 0' }}>
                  <span style={{ fontSize: 48 }}>⚠️</span>
                  <p style={{ fontSize: 16, fontWeight: 800 }}>Couldn't load leaderboard</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Check your connection and try again.</p>
                  <button
                    onClick={() => {
                      setLbLoading(true)
                      setLbFetchError(false)
                      supabase.rpc('get_leaderboard', { p_timeframe: lbTimeframe }).then(({ data, error }) => {
                        if (error) { setLbFetchError(true) } else if (data) { setLbEntries(data) }
                        setLbLoading(false)
                      })
                    }}
                    style={{ marginTop: 6, fontSize: 13, fontWeight: 700, padding: '10px 20px', borderRadius: 12, backgroundColor: 'rgba(201,244,0,0.1)', color: 'var(--accent)', border: '1px solid var(--fg-13)', cursor: 'pointer' }}
                  >
                    Retry
                  </button>
                </div>
              ) : lbEntries.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 0' }}>
                  <TrophyIcon size={48} color="#8b9284" />
                  <p style={{ fontSize: 18, fontWeight: 800 }}>No reports yet</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Be the first to submit a report!</p>
                </div>
              ) : (
                <>
                  {/* Leaderboard table */}
                  <div style={{ backgroundColor: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 72px', padding: '10px 16px', backgroundColor: 'rgba(201,244,0,0.03)', borderBottom: '1px solid var(--border)' }}>
                      {['#', 'Reporter', 'Points'].map((h, i) => (
                        <div key={h} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-dim)', textAlign: i > 0 ? 'right' : 'left' }}>
                          {h}
                        </div>
                      ))}
                    </div>

                    {lbEntries.map((entry, i) => {
                      const rank = i + 1
                      const isMe = entry.id === user.id
                      const isTop3 = rank <= 3
                      const rankStyle = RANK_COLOR[rank] ?? {}
                      const medal = MEDAL[rank]
                      const initial = (entry.username as string)[0].toUpperCase()

                      return (
                        <div key={entry.id}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '44px 1fr 72px',
                            padding: '11px 16px',
                            background: isMe ? 'rgba(201,244,0,0.05)' : isTop3 ? rankStyle.bg : 'transparent',
                            borderBottom: i < lbEntries.length - 1 ? '1px solid var(--border)' : 'none',
                            borderLeft: isMe ? '2px solid #C9F400' : isTop3 ? `2px solid ${rankStyle.border}` : '2px solid transparent',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            {medal
                              ? <span style={{ fontSize: 18 }}>{medal}</span>
                              : <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-dim)' }}>{rank}</span>
                            }
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                            <div style={{ width: 32, height: 32, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#0D1210', flexShrink: 0 }}>
                              {initial}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                <Link href={`/u/${entry.username}`} style={{ fontSize: 13, fontWeight: 700, color: isMe ? '#C9F400' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>
                                  @{entry.username}
                                </Link>
                                {isMe && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', backgroundColor: 'rgba(201,244,0,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>You</span>}
                                {entry.is_verified_reporter && <span style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 8, padding: '2px 5px', flexShrink: 0 }}><CheckIcon size={9} color="#60a5fa" /></span>}
                                {entry.tier === 'tracker' && <span style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(201,244,0,0.12)', borderRadius: 8, padding: '2px 5px', flexShrink: 0 }}><LightningIcon size={9} color="var(--accent)" /></span>}
                                {Array.isArray(entry.badges) && entry.badges.includes('weekly_champion') && <span style={{ fontSize: 11, fontWeight: 800, color: '#ffd700', backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>👑 Champ</span>}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: isTop3 ? rankStyle.text || 'var(--text)' : 'var(--text-muted)' }}>
                              {entry.points}
                            </span>
                            <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>pts</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* How points work */}
                  <div style={{ marginTop: 16, backgroundColor: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '16px' }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 12 }}>How points work</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[
                        { icon: LightningIcon, label: 'Report a drink', desc: 'Each drink you report at a store', pts: '+2 pts', color: 'var(--accent)' },
                        { icon: GroceryIcon,   label: 'Add a store',    desc: 'Awarded after admin approval',    pts: '+5 pts', color: '#FFB300' },
                        { icon: DrinkIcon,     label: 'Add a drink',    desc: 'Each new drink you submit',        pts: '+3 pts', color: '#06b6d4' },
                      ].map((item, i, arr) => (
                        <div key={item.label}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${item.color}18`, border: `1px solid ${item.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <item.icon size={15} color={item.color} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{item.label}</p>
                              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 1 }}>{item.desc}</p>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 800, color: item.color }}>{item.pts}</span>
                          </div>
                          {i < arr.length - 1 && <div style={{ height: 1, backgroundColor: 'rgba(201,244,0,0.08)', marginTop: 10 }} />}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Upgrade CTA — hidden for tracker (top tier) */}
                  {profile?.tier !== 'tracker' && !profile?.is_admin && (
                    <div style={{ marginTop: 16, backgroundColor: 'rgba(201,244,0,0.04)', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 3 }}>
                          See the whole map with Tracker
                        </p>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          Unlimited radius, exact report times and saved store lists
                        </p>
                      </div>
                      <button
                        onClick={() => router.push('/account')}
                        style={{ padding: '10px 20px', backgroundColor: '#C9F400', border: 'none', borderRadius: 10, color: '#0D1210', fontSize: 14, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Upgrade
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}
