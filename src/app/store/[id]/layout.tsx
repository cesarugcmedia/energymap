import type { Metadata } from 'next'
import { ago, loadStoreCard } from '@/lib/shareCards'

// The store page is a client component; this server layout gives shared
// store links a real title/description for link previews. The image comes
// from ./opengraph-image.tsx.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const card = await loadStoreCard(id).catch(() => null)
  if (!card) return { title: 'Store on AmpedMap' }
  const title = `${card.name}: what's in stock`
  const fresh = ago(card.latestAt)
  const description = card.total > 0
    ? `${card.inStock} of ${card.total} energy drink flavors in stock${fresh ? `, last reported ${fresh}` : ''}.${card.top.length ? ` ${card.top.slice(0, 3).map((t) => t.label).join(', ')}.` : ''}`
    : `See what energy drinks are in stock at ${card.name} on AmpedMap.`
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
