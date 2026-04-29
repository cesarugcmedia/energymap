'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallback() {
  const router = useRouter()

  useEffect(() => {
    const run = async () => {
      // Give the Supabase SDK a moment to exchange the code/hash from the URL
      await new Promise((r) => setTimeout(r, 800))

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        // Exchange didn't work (different device, expired link, etc.) — fall back to sign-in
        router.replace('/account?confirmed=1')
        return
      }

      // Check if the profile was already created
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!profile) {
        const pending = localStorage.getItem('pending_profile')
        const { username, tier } = pending
          ? JSON.parse(pending)
          : { username: session.user.email?.split('@')[0] ?? 'user', tier: 'free' }

        await supabase.from('profiles').insert({ id: session.user.id, username, tier: 'free' })

        // Welcome email
        fetch('/api/email/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ email: session.user.email, username, tier }),
        }).catch(() => {})

        localStorage.removeItem('pending_profile')
      }

      router.replace('/')
    }

    run()
  }, [router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #22c55e', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  )
}
