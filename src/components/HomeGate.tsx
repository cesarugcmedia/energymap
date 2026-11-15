'use client'

import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthContext'
import BoltLoader from '@/components/ui/BoltLoader'

// Loaded only for signed-in users, so landing-page visitors never download
// the map bundle (Mapbox, Supercluster, etc.).
const MapHome = dynamic(() => import('@/components/MapHome'), {
  ssr: false,
  loading: () => <HomeSpinner />,
})

function HomeSpinner() {
  return (
    <BoltLoader message="Charging up the map…" />
  )
}

// `/` serves two audiences: the map for signed-in users, the marketing
// landing page for everyone else. The landing page is server-rendered (fast,
// crawlable), so it's always in the initial HTML. An inline script in the root
// layout sets <html data-authed="1"> before first paint when a saved Supabase
// session exists; globals.css then hides the landing and shows a spinner, so
// signed-in users never see a flash of marketing. Both are rendered the same
// way on server and client, so there's no hydration mismatch.
export default function HomeGate({ landing }: { landing: React.ReactNode }) {
  const { user, loading } = useAuth()

  // Saved session turned out to be invalid/expired: reveal the landing page.
  useEffect(() => {
    if (!loading && !user) document.documentElement.removeAttribute('data-authed')
  }, [loading, user])

  if (user) return <MapHome />

  return (
    <>
      <div className="home-auth-spinner"><HomeSpinner /></div>
      <div className="landing-root">{landing}</div>
    </>
  )
}
