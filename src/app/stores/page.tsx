'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Stores list is now the List View toggle on the merged map/stores page.
export default function StoresRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="w-8 h-8 border-2 border-[#C9F400] border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
