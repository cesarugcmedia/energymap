'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

// Signed-in visitors skip the public copy and open the post in the feed.
export default function OpenInApp({ postId }: { postId: string }) {
  const router = useRouter()
  const { user, loading } = useAuth()
  useEffect(() => {
    if (!loading && user) router.replace(`/community?post=${postId}`)
  }, [user, loading, postId, router])
  return null
}
