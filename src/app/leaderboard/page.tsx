'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Leaderboard is now the Leaderboard sub-tab on the Community page.
export default function LeaderboardRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/community?view=leaderboard')
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
