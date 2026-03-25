'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function NotificationBell() {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    if (!user) return
    fetchUnread()

    const channel = supabase
      .channel(`notif-bell-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => setUnread((n) => n + 1))
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  useEffect(() => {
    if (pathname === '/notifications') setUnread(0)
  }, [pathname])

  async function fetchUnread() {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user!.id)
      .eq('read', false)
    setUnread(count ?? 0)
  }

  return (
    <button
      onClick={() => router.push('/notifications')}
      className="relative w-9 h-9 rounded-xl flex items-center justify-center"
      style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
    >
      <span style={{ fontSize: 18 }}>🔔</span>
      {unread > 0 && (
        <div
          className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full flex items-center justify-center px-1"
          style={{ backgroundColor: '#ef4444', fontSize: 9, fontWeight: 700, color: '#fff' }}
        >
          {unread > 9 ? '9+' : unread}
        </div>
      )}
    </button>
  )
}
