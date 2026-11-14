import type { Metadata } from 'next'
import { createClient } from '@supabase/supabase-js'
import HomeGate from '@/components/HomeGate'
import Landing, { type LandingStats } from '@/components/landing/Landing'

export const metadata: Metadata = {
  title: 'AmpedMap — Find energy drinks in stock near you',
  description: 'See which stores near you have your favorite energy drinks in stock, reported by people who just saw the shelf. Free to use.',
  alternates: { canonical: 'https://ampedmap.com' },
}

// Re-render the landing page (and its live counts) at most once an hour.
export const revalidate = 3600

async function getStats(): Promise<LandingStats | null> {
  try {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const [stores, drinks, trackers] = await Promise.all([
      supabase.from('stores').select('id', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('drinks').select('id', { count: 'exact', head: true }),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('tier', 'tracker'),
    ])
    if (stores.error || drinks.error) return null
    return { stores: stores.count ?? 0, drinks: drinks.count ?? 0, trackers: trackers.error ? null : trackers.count ?? 0 }
  } catch {
    // Placeholder env (local builds) or Supabase unreachable: the landing page
    // simply renders without numbers rather than showing made-up ones.
    return null
  }
}

export default async function Home() {
  const stats = await getStats()
  return <HomeGate landing={<Landing stats={stats} />} />
}
