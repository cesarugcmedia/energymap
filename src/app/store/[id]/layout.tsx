import type { Metadata } from 'next'
import { ago, loadStoreCard } from '@/lib/shareCards'

// The store page is a client component; this server layout gives shared
// store links a real title/description for link previews. The image comes
// from ./opengraph-image.tsx.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const card = await loadStoreCard(id).catch(() => null)
  if (!card) return { title: 'Store on AmpedMap' }
  const title = `${card.name}: what's been spotted`
  const fresh = ago(card.latestAt)
  const description = card.total > 0
    ? `${card.inStock} energy drink flavor${card.inStock === 1 ? '' : 's'} spotted${fresh ? `, last sighting ${fresh}` : ''}.${card.top.length ? ` ${card.top.slice(0, 3).map((t) => t.label).join(', ')}.` : ''}`
    : `See which energy drinks have been spotted at ${card.name} on AmpedMap.`
  return {
    title,
    description,
    openGraph: { title, description, url: `/store/${card.id}`, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children
}
