'use client'

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useAuth } from '@/contexts/AuthContext'

// Appearance: 'dark' (the original look), 'light', or 'system' (follow the
// phone). Saved per device in localStorage under THEME_KEY. Applied as
// <html data-theme="light"> — before first paint by the inline script in
// layout.tsx, and kept in sync here. Signed-out pages (landing, sign in)
// always stay dark, so the attribute is only set while signed in.

export type ThemePref = 'dark' | 'light' | 'system'
export const THEME_KEY = 'ampedmap_theme'

type ThemeCtx = { pref: ThemePref; theme: 'dark' | 'light'; setPref: (p: ThemePref) => void }
const ThemeContext = createContext<ThemeCtx>({ pref: 'dark', theme: 'dark', setPref: () => {} })

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'system' ? v : 'dark'
  } catch { return 'dark' }
}

function systemPrefersLight() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [pref, setPrefState] = useState<ThemePref>('dark')
  const [systemLight, setSystemLight] = useState(false)

  useEffect(() => {
    setPrefState(readPref())
    setSystemLight(systemPrefersLight())
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystemLight(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const theme: 'dark' | 'light' = user && (pref === 'light' || (pref === 'system' && systemLight)) ? 'light' : 'dark'

  useLayoutEffect(() => {
    const root = document.documentElement
    if (theme === 'light') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F3F5EF' : '#0A0B0A')
  }, [theme])

  // Crossfade the whole screen when switching (View Transitions API where
  // supported; otherwise an instant switch). flushSync makes React apply the
  // new theme inside the transition's snapshot window.
  const setPref = useCallback((p: ThemePref) => {
    try { localStorage.setItem(THEME_KEY, p) } catch { /* ignore */ }
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (doc.startViewTransition && !reduce) doc.startViewTransition(() => flushSync(() => setPrefState(p)))
    else setPrefState(p)
  }, [])

  return <ThemeContext.Provider value={{ pref, theme, setPref }}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
