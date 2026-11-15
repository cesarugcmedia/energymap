import type { Metadata } from 'next'

// The profile page itself is a client component; this server layout only
// gives shared profile links a proper title/description for link previews.
// The preview image comes from ./opengraph-image.tsx.
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params
  const name = decodeURIComponent(username).toLowerCase()
  const title = `@${name} on AmpedMap`
  const description = `See @${name}'s energy drink finds, flavor collection and favorite stores on AmpedMap.`
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, url: `/u/${name}`, type: 'profile' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return children
}
