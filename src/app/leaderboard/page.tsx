'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', backgroundColor: 'var(--bg)' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const myEntry = entries.find((e) => e.id === user.id)
  const myRank = myEntry ? entries.indexOf(myEntry) + 1 : null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden', position: 'relative', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .lb-row { transition: background 0.12s ease; }
        .lb-row:hover { background: rgba(201,244,0,0.03) !important; }
        .tab-btn { transition: all 0.15s ease; cursor: pointer; }
      `}</style>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 20px 80px' }}>

        {/* Header */}
        <div style={{ padding: '12px 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', animation: 'fadeUp 0.5s ease' }}>
          <div>
            <h1 style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 34, fontWeight: 800, letterSpacing: '0.02em', textTransform: 'uppercase', color: 'var(--text)', lineHeight: 1 }}>
              Leader<span style={{ color: 'var(--accent)' }}>board</span>
            </h1>
            <p style={{ fontSize: 13, color: '#7A8F80', marginTop: 4, fontWeight: 500, letterSpacing: '0.04em' }}>Top reporters keeping the community stocked</p>
          </div>
        </div>

        {/* Timeframe tabs */}
        <div style={{ display: 'flex', backgroundColor: 'var(--surface)', borderRadius: 12, padding: 3, border: '1px solid rgba(201,244,0,0.12)', marginBottom: 16, animation: 'fadeUp 0.5s ease 0.05s both' }}>
          {TIMEFRAMES.map((tf) => (
            <button key={tf} className="tab-btn"
              onClick={() => setTimeframe(tf)}
              style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', textTransform: 'uppercase', backgroundColor: timeframe === tf ? '#C9F400' : 'transparent', color: timeframe === tf ? '#0D1210' : '#4A5F50', boxShadow: timeframe === tf ? '0 0 12px rgba(201,244,0,0.3)' : 'none' }}>
              {tf}
            </button>
          ))}
        </div>

        {/* My Rank Banner */}
        {myEntry && myRank && (
          <div style={{ backgroundColor: 'rgba(201,244,0,0.06)', border: '1px solid rgba(201,244,0,0.18)', borderRadius: 14, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeUp 0.5s ease 0.1s both' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#C9F400', animation: 'pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: '0.14em', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Your Rank</span>
            </div>
            <div style={{ width: 1, height: 16, backgroundColor: 'rgba(201,244,0,0.12)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: AVATAR_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: '#0D1210', flexShrink: 0 }}>
                {(myEntry.username as string)[0].toUpperCase()}
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>#{myRank} · {myEntry.points} pts</span>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
            <div style={{ width: 32, height: 32, border: '2px solid #C9F400', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : fetchError ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 0' }}>
            <span style={{ fontSize: 48 }}>⚠️</span>
            <p style={{ fontSize: 16, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>Couldn't load leaderboard</p>
            <p style={{ fontSize: 13, color: '#7A8F80' }}>Check your connection and try again.</p>
          </div>
        ) : entries.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '80px 0' }}>
            <span style={{ fontSize: 48 }}>🏆</span>
            <p style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>No reports yet</p>
            <p style={{ fontSize: 13, color: '#7A8F80' }}>Be the first to submit a report!</p>
          </div>
        ) : (
          <>
            {/* Leaderboard table */}
            <div style={{ backgroundColor: 'var(--surface)', borderRadius: 16, border: '1px solid rgba(201,244,0,0.12)', overflow: 'hidden', animation: 'fadeUp 0.5s ease 0.15s both' }}>

              {/* Column headers */}
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 72px', padding: '10px 16px', backgroundColor: 'rgba(201,244,0,0.03)', borderBottom: '1px solid rgba(201,244,0,0.08)' }}>
                {['#', 'Reporter', 'Points'].map((h, i) => (
                  <div key={h} style={{ fontSize: 10, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', textAlign: i > 0 ? 'right' : 'left', fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>
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
                      background: isMe ? 'rgba(201,244,0,0.05)' : isTop3 ? rankStyle.bg : 'transparent',
                      borderBottom: i < entries.length - 1 ? '1px solid rgba(201,244,0,0.06)' : 'none',
                      borderLeft: isMe ? '2px solid #C9F400' : isTop3 ? `2px solid ${rankStyle.border}` : '2px solid transparent',
                    }}
                  >
                    {/* Rank */}
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {medal
                        ? <span style={{ fontSize: 18 }}>{medal}</span>
                        : <span style={{ fontSize: 13, fontWeight: 800, color: '#4A5F50', fontFamily: "'Barlow Condensed', sans-serif" }}>{rank}</span>
                      }
                    </div>

                    {/* User */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: AVATAR_COLORS[i % AVATAR_COLORS.length], display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#0D1210', flexShrink: 0 }}>
                        {initial}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: isMe ? '#C9F400' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>
                            @{entry.username}
                          </span>
                          {isMe && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)', backgroundColor: 'rgba(201,244,0,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>YOU</span>}
                          {entry.is_verified_reporter && <span style={{ fontSize: 9, fontWeight: 800, color: '#60a5fa', backgroundColor: 'rgba(59,130,246,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>✓</span>}
                          {entry.tier === 'tracker' && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)', backgroundColor: 'rgba(201,244,0,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>⚡</span>}
                          {Array.isArray(entry.badges) && entry.badges.includes('weekly_champion') && <span style={{ fontSize: 9, fontWeight: 800, color: '#ffd700', backgroundColor: 'rgba(255,215,0,0.12)', borderRadius: 8, padding: '1px 6px', flexShrink: 0 }}>👑 Champ</span>}
                        </div>
                      </div>
                    </div>

                    {/* Points */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: isTop3 ? rankStyle.text || 'var(--text)' : 'var(--fg-50)', fontFamily: "'Barlow Condensed', sans-serif" }}>
                        {entry.points}
                      </span>
                      <span style={{ fontSize: 11, color: '#4A5F50', fontFamily: "'Barlow Condensed', sans-serif" }}>pts</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* How points work */}
            <div style={{ marginTop: 16, backgroundColor: 'var(--surface)', borderRadius: 16, border: '1px solid rgba(201,244,0,0.12)', padding: '16px', animation: 'fadeUp 0.5s ease 0.2s both' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#4A5F50', letterSpacing: '0.14em', marginBottom: 12, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase' }}>How Points Work</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[
                  { icon: '⚡', label: 'Report a drink', desc: 'Each drink you report at a store', pts: '+2 pts', color: 'var(--accent)' },
                  { icon: '🏪', label: 'Add a store',    desc: 'Awarded after admin approval',    pts: '+5 pts', color: '#FFB300' },
                  { icon: '🥤', label: 'Add a drink',    desc: 'Each new drink you submit',        pts: '+3 pts', color: '#06b6d4' },
                ].map((item, i, arr) => (
                  <div key={item.label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: `${item.color}18`, border: `1px solid ${item.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 15 }}>{item.icon}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>{item.label}</p>
                        <p style={{ fontSize: 11, color: '#7A8F80', marginTop: 1 }}>{item.desc}</p>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: item.color, fontFamily: "'Barlow Condensed', sans-serif" }}>{item.pts}</span>
                    </div>
                    {i < arr.length - 1 && <div style={{ height: 1, backgroundColor: 'rgba(201,244,0,0.08)', marginTop: 10 }} />}
                  </div>
                ))}
              </div>
            </div>

            {/* Upgrade CTA — hidden for tracker (top tier) */}
            {profile?.tier !== 'tracker' && !profile?.is_admin && (
              <div style={{ marginTop: 16, backgroundColor: 'rgba(201,244,0,0.04)', border: '1px solid rgba(201,244,0,0.15)', borderRadius: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', animation: 'fadeUp 0.5s ease 0.25s both' }}>
                <div>
                  <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)', marginBottom: 3, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    ⚡ Tracker members get early alerts + history
                  </p>
                  <p style={{ fontSize: 12, color: '#7A8F80' }}>
                    Full report history, custom lists, and verified badge
                  </p>
                </div>
                <button
                  onClick={() => router.push('/account')}
                  style={{ padding: '10px 20px', backgroundColor: '#C9F400', border: 'none', borderRadius: 10, color: '#0D1210', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.06em', textTransform: 'uppercase', boxShadow: '0 0 14px rgba(201,244,0,0.3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
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
