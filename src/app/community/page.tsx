'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Toast from '@/components/Toast'
import Feed from '@/components/community/Feed'
import Leaderboard from '@/components/community/Leaderboard'
import { ClipboardIcon, TrophyIcon, UsersIcon } from '@/components/Icons'
import PeopleSheet from '@/components/community/PeopleSheet'
import { usePresence } from '@/contexts/PresenceContext'
import { usePreferences } from '@/lib/preferences'
import ui from '@/components/ui/ui.module.css'
import SlideHighlight from '@/components/ui/SlideHighlight'
import BoltLoader from '@/components/ui/BoltLoader'

type MainView = 'feed' | 'leaderboard'

// Community tab: the Feed (src/components/community/Feed.tsx) and the
// Leaderboard (src/components/community/Leaderboard.tsx), switched by a
// sub-toggle under the header. /leaderboard redirects here with ?view=leaderboard.
export default function CommunityPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const [mainView, setMainView] = useState<MainView>('feed')
  const [findPeople, setFindPeople] = useState(false)
  const { online } = usePresence()
  const liveCount = [...online].filter((id) => id !== user?.id).length
  const { prefs } = usePreferences()
  const [toastMessage, setToastMessage] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  function showToast(message: string) {
    setToastMessage(message)
    setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2800)
  }

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'leaderboard') setMainView('leaderboard')
  }, [])

  if (authLoading || !user) {
    return (
      <BoltLoader message="Loading the community…" />
    )
  }

  const p = profile as any
  const me = {
    id: user.id,
    username: profile?.username ?? 'you',
    // Last map location, else the home area from the welcome flow.
    lat: typeof p?.last_lat === 'number' ? p.last_lat : prefs.homeLat,
    lng: typeof p?.last_lng === 'number' ? p.last_lng : prefs.homeLng,
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden', position: 'relative', paddingTop: 'calc(56px + env(safe-area-inset-top))' }}>
      <Toast message={toastMessage} visible={toastVisible} />
      {findPeople && <PeopleSheet mode="search" onClose={() => setFindPeople(false)} />}

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px 100px' }}>
        <div style={{ padding: '12px 0 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <h1 style={{ fontSize: 30, fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>Community</h1>
            <button className={ui.btnSecondary} onClick={() => setFindPeople(true)} style={{ padding: '8px 12px', fontSize: 14, gap: 6 }}>
              <UsersIcon size={16} color="var(--text)" /> Find people
            </button>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>Finds, questions and posts from hunters near you</p>
          {liveCount > 0 && (
            <button onClick={() => setFindPeople(true)} className="anim-fade" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 8, padding: 0, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--accent-text)' }}>
              <span className="live-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: '#C9F400' }} />
              {liveCount} {liveCount === 1 ? 'hunter' : 'hunters'} live now
            </button>
          )}
        </div>

        <div className={ui.segSlide} style={{ display: 'flex', backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 4, gap: 4, marginBottom: 14 }}>
          <SlideHighlight activeKey={mainView} radius={12} />
          {([
            { view: 'feed' as MainView, label: 'Feed', icon: ClipboardIcon },
            { view: 'leaderboard' as MainView, label: 'Leaderboard', icon: TrophyIcon },
          ]).map(({ view, label, icon: Icon }) => {
            const active = mainView === view
            const color = active ? '#0D1210' : 'var(--text-muted)'
            return (
              <button
                key={view}
                data-active={active}
                onClick={() => setMainView(view)}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 12, border: 'none', fontSize: 14, fontWeight: 600, backgroundColor: 'transparent', color, fontFamily: 'inherit', cursor: 'pointer' }}
              >
                <Icon size={14} color={color} />
                {label}
              </button>
            )
          })}
        </div>

        {mainView === 'feed'
          ? <Feed me={me} toast={showToast} />
          : <Leaderboard me={{ ...me, isTrackerOrAdmin: !!profile?.is_admin || profile?.tier === 'tracker' }} />}
      </div>
    </div>
  )
}
