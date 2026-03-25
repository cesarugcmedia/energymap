'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import NotificationBell from '@/components/NotificationBell'

const MEDAL: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

export default function LeaderboardPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  useEffect(() => {
    if (!user) return
    supabase
      .from('leaderboard_view')
      .select('*')
      .order('points', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setEntries(data)
        setLoading(false)
      })
  }, [user])

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const myRank = entries.findIndex((e) => e.id === user.id)

  return (
    <div className="min-h-screen bg-[#0a0a0f]" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pb-4">
        <div>
          <p className="text-2xl font-black text-white">🏆 Leaderboard</p>
          <p className="text-xs text-white/40 mt-0.5">Top reporters this season</p>
        </div>
        <NotificationBell />
      </div>

      {/* How points work */}
      <div className="px-5 mb-5">
        <div
          className="rounded-2xl p-4"
          style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <p className="text-[10px] font-bold mb-3" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>
            HOW POINTS WORK
          </p>
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.2)' }}
              >
                <span style={{ fontSize: 16 }}>⚡</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">Report a drink</p>
                <p className="text-xs text-white/40">Each drink you report at a store</p>
              </div>
              <span className="text-sm font-black" style={{ color: '#22c55e' }}>+2 pts</span>
            </div>
            <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'rgba(250,204,21,0.12)', border: '1px solid rgba(250,204,21,0.2)' }}
              >
                <span style={{ fontSize: 16 }}>🏪</span>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">Add a store</p>
                <p className="text-xs text-white/40">Awarded after admin approval</p>
              </div>
              <span className="text-sm font-black" style={{ color: '#facc15' }}>+5 pts</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center mt-16">
          <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Your rank banner */}
          {myRank >= 0 && (
            <div className="px-5 mb-5">
              <div
                className="rounded-2xl px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black" style={{ color: '#22c55e', minWidth: 28 }}>
                    #{myRank + 1}
                  </span>
                  <p className="text-sm font-bold text-white">You · @{profile?.username}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span style={{ fontSize: 14 }}>⚡</span>
                  <p className="text-sm font-black" style={{ color: '#22c55e' }}>
                    {entries[myRank]?.points ?? 0} pts
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Full ranked list */}
          {entries.length > 0 && (
            <div className="px-5 mb-6">
              <p className="text-[10px] font-bold mb-3" style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '1.5px' }}>
                ALL REPORTERS
              </p>
              <div className="flex flex-col gap-2">
                {entries.map((entry, i) => {
                  const rank = i + 1
                  const isMe = entry.id === user.id
                  return (
                    <div
                      key={entry.id}
                      className="rounded-2xl px-4 py-3 flex items-center gap-3"
                      style={{
                        backgroundColor: isMe ? 'rgba(34,197,94,0.06)' : '#1a1a24',
                        border: `1px solid ${isMe ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.07)'}`,
                      }}
                    >
                      <div className="w-7 shrink-0 flex items-center justify-center">
                        {MEDAL[rank]
                          ? <span style={{ fontSize: 18 }}>{MEDAL[rank]}</span>
                          : <p className="text-sm font-black text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>{rank}</p>
                        }
                      </div>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0 flex-wrap">
                        <p className="text-sm font-bold text-white truncate">@{entry.username}</p>
                        {entry.is_verified_reporter && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.3)' }}>✓ VERIFIED</span>
                        )}
                        {isMe && <span className="text-xs text-white/40 font-normal">· you</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <span style={{ fontSize: 11 }}>⚡</span>
                        <span className="text-sm font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {entry.points}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {entries.length === 0 && (
            <div className="flex flex-col items-center gap-3 mt-20">
              <span style={{ fontSize: 48 }}>🏆</span>
              <p className="text-lg font-bold text-white">No reporters yet</p>
              <p className="text-sm text-white/40">Be the first to submit a report!</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
