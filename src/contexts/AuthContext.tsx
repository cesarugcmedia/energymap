'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

/* eslint-disable @typescript-eslint/no-explicit-any */

interface AuthContextType {
  user: any
  profile: any
  loading: boolean
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true, refreshProfile: async () => {} })


// Supabase fires auth events for routine things too: INITIAL_SESSION on
// subscribe, TOKEN_REFRESHED about hourly, SIGNED_IN again when the tab
// regains focus. Only a change of *who* is signed in should reset `loading`
// and refetch the profile; otherwise every page would drop back to its
// full-screen loader and re-run its data fetches (they depend on `user`).
// The same user keeps the same `user` object for that reason.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const userIdRef = useRef<string | null | undefined>(undefined) // undefined = not known yet
  const hasProfileRef = useRef(false)
  useEffect(() => { hasProfileRef.current = !!profile }, [profile])

  const fetchProfile = useCallback(async (userId: string, attempt = 0): Promise<void> => {
    try {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (userIdRef.current !== userId) return // signed out / switched meanwhile
      if (data) {
        setProfile(data)
        setLoading(false)
        return
      }
    } catch {
      // retry below
    }
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 300))
      return fetchProfile(userId, attempt + 1)
    }
    if (userIdRef.current === userId) {
      setProfile(null)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const apply = (sessionUser: any) => {
      const id = sessionUser?.id ?? null
      if (id === userIdRef.current) return
      userIdRef.current = id
      setUser(sessionUser ?? null)
      if (id) {
        setLoading(true)
        fetchProfile(id)
      } else {
        setProfile(null)
        setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => apply(session?.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Email/metadata changes keep the id but should still show up.
      if (event === 'USER_UPDATED' && session?.user && session.user.id === userIdRef.current) setUser(session.user)
      else apply(session?.user)
    })
    return () => subscription.unsubscribe()
  }, [fetchProfile])

  // Re-reads the profile row in place. Only shows the loading state when
  // there's no profile yet (e.g. right after SetupProfile creates it), so
  // saving a setting doesn't flash the full-screen loader.
  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const id = session?.user?.id
    if (!id) return
    if (id !== userIdRef.current) {
      userIdRef.current = id
      setUser(session!.user)
    }
    if (!hasProfileRef.current) setLoading(true)
    await fetchProfile(id)
  }, [fetchProfile])

  const value = useMemo(() => ({ user, profile, loading, refreshProfile }), [user, profile, loading, refreshProfile])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
