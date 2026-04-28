'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import NotificationBell from '@/components/NotificationBell'

const TIMEFRAMES = ['All Time', 'This Month', 'This Week']

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }
const RANK_COLOR: Record<number, { text: string; border: string; bg: string }> = {
  1: { text: '#ffd700', border: 'rgba(255,215,0,0.2)',   bg: 'rgba(255,215,0,0.05)'   },
  2: { text: '#c0c0c0', border: 'rgba(192,192,192,0.15)', bg: 'rgba(192,192,192,0.04)' },
  3: { text: '#cd7f32', border: 'rgba(205,127,50,0.15)',  bg: 'rgba(205,127,50,0.04)'  },
}

const AVATAR_COLORS = [
  'linear-gradient(135deg, #22c55e, #16a34a)',
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #a855f7, #7c3aed)',
  'linear-gradient(135deg, #f97316, #ea580c)',
  'linear-gradient(135deg, #ec4899, #be185d)',
  'linear-gradient(135deg, #06b6d4, #0284c7)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #6366f1, #4f46e5)',
  'linear-gradient(135deg, #ef4444, #dc2626)',
]

export default function LeaderboardPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [timeframe, setTimeframe] = useState('All Time')

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setFetchError(false)
    supabase
      .rpc('get_leaderboard', { p_timeframe: timeframe })
      .then(({ data, error }) => {
        if (error) { setFetchError(true) } else if (data) { setEntries(data) }
        setLoading(false)
      })
  }, [user, timeframe])

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#070710]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const myEntry = entries.find((e) => e.id === user.id)
  const myRank = myEntry ? entries.indexOf(myEntry) + 1 : null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#070710', color: '#fff', overflowX: 'hidden', position: 'relative', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(34,197,94,0.08) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .lb-row { transition: background 0.12s ease; }
        .lb-row:hover { background: rgba(255,255,255,0.03) !important; }
        .tab-btn { transition: all 0.15s ease; cursor: pointer; }
      `}</style>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* Header */}
        <div style={{ padding: '12px 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeUp 0.5s ease' }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 2, color: '#fff', lineHeight: 1 }}>Leaderboard</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Top reporters keeping the community stocked</p>
          </div>
          <NotificationBell />
        </div>

        {/* Timeframe tabs */}
        <div style={{ display: 'flex', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 3, border: '1px solid rgba(255,255,255,0.07)', marginBottom: 16, animation: 'fadeUp 0.5s ease 0.05s both' }}>
          {TIMEFRAMES.map((tf) => (
            <button key={tf} className="tab-btn"
              onClick={() => setTimeframe(tf)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", backgroundColor: timeframe === tf ? '#22c55e' : 'transparent', color: timeframe === tf ? '#fff' : 'rgba(255,255,255,0.4)' }}>
              {tf}
            </button>
          ))}
        </div>

        {/* My Rank Banner */}
        {myEntry && myRank && (
          <div style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeUp 0.5s ease 0.1s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: 1.5 }}>YOUR RANK</span>
            </div>
            <div style={{ width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.08)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: AVATAR_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                {(myEntry.username as string)[0].toUpperCase()}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>#{myRank} · {myEntry.points} pts</span>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : fetchError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 0' }}>
            <span style={{ fontSize: 48 }}>⚠️</span>
            <p style={{ fontSize: 16, fontWeight: 800 }}>Couldn't load leaderboard</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Check your connection and try again.</p>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 0' }}>
            <span style={{ fontSize: 48 }}>🏆</span>
            <p style={{ fontSize: 18, fontWeight: 800 }}>No reporters yet</p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Be the first to submit a report!</p>
          </div>
        ) : (
          <>
            {/* Leaderboard table */}
            <div style={{ backgroundColor: '#0f0f1a', borderRadius: 18, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden', animation: 'fadeUp 0.5s ease 0.15s both' }}>

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 72px', padding: '10px 16px', backgroundColor: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {['#', 'Reporter', 'Points'].map((h, i) => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: 1.2, textAlign: i > 0 ? 'right' : 'left' }}>
                    {h}
                  </div>
                ))}
              </div>

              {entries.map((entry, i) => {
                const rank = i + 1
                const isMe = entry.id === user.id
                const isTop3 = rank <= 3
                const rankStyle = RANK_COLOR[rank] ?? {}
                const medal = MEDAL[rank]
                const initial = (entry.username as string)[0].toUpperCase()

                return (
                  <div key={entry.id} className="lb-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '44px 1fr 72px',
                      padding: '11px 16px',
                      background: isMe ? 'rgba(34,197,94,0.05)' : isTop3 ? rankStyle.bg : 'transparent',
                      borderBottom: i < entries.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      borderLeft: isMe ? '2px solid #22c55e' : isTop3 ? `2px solid ${rankStyle.border}` : '2px solid transparent',
                    }}
                  >
                    {/* Rank */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {medal
                        ? <span style={{ fontSize: 18 }}>{medal}</span>
                        : <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.25)' }}>{rank}</span>
                      }
                    </div>

                    {/* User */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#fff', flexShrink: 0 }}>
                        {initial}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isMe ? '#22c55e' : '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            @{entry.username}
                          </span>
                          {isMe && <span style={{ fontSize: 9, fontWeight: 800, color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>YOU</span>}
                          {entry.is_verified_reporter && <span style={{ fontSize: 9, fontWeight: 800, color: '#60a5fa', backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>✓</span>}
                          {entry.tier === 'tracker' && <span style={{ fontSize: 9, fontWeight: 800, color: '#f97316', backgroundColor: 'rgba(249,115,22,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>🔥</span>}
                          {Array.isArray(entry.badges) && entry.badges.includes('weekly_champion') && <span style={{ fontSize: 9, fontWeight: 800, color: '#ffd700', backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>👑 Champ</span>}
                        </div>
                      </div>
                    </div>

                    {/* Points */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: isTop3 ? rankStyle.text || '#fff' : 'rgba(255,255,255,0.8)' }}>
                        {entry.points}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>pts</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* How points work */}
            <div style={{ marginTop: 16, backgroundColor: '#0f0f1a', borderRadius: 18, border: '1px solid rgba(255,255,255,0.07)', padding: '16px', animation: 'fadeUp 0.5s ease 0.2s both' }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.28)', letterSpacing: 1.5, marginBottom: 12 }}>HOW POINTS WORK</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { icon: '⚡', label: 'Report a drink', desc: 'Each drink you report at a store', pts: '+2 pts', color: '#22c55e' },
                  { icon: '🏪', label: 'Add a store',    desc: 'Awarded after admin approval',    pts: '+5 pts', color: '#facc15' },
                  { icon: '🥤', label: 'Add a drink',    desc: 'Each new drink you submit',        pts: '+3 pts', color: '#06b6d4' },
                ].map((item, i, arr) => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${item.color}18`, border: `1px solid ${item.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 15 }}>{item.icon}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{item.label}</p>
                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{item.desc}</p>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: item.color }}>{item.pts}</span>
                    </div>
                    {i < arr.length - 1 && <div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.05)', marginTop: 10 }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Upgrade CTA — hidden for tracker (top tier) */}
            {profile?.tier !== 'tracker' && !profile?.is_admin && (
              <div style={{ marginTop: 16, background: 'linear-gradient(135deg, rgba(249,115,22,0.06) 0%, rgba(249,115,22,0.02) 100%)', border: '1px solid rgba(249,115,22,0.15)', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', animation: 'fadeUp 0.5s ease 0.25s both' }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 3 }}>
                    🔥 Tracker members get early alerts + history
                  </p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    Full report history, custom lists, and verified badge
                  </p>
                </div>
                <button
                  onClick={() => router.push('/account')}
                  style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #f97316, #ea6c0a)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", boxShadow: '0 4px 14px rgba(249,115,22,0.25)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Upgrade →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
