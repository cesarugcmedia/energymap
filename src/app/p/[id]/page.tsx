import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ago, LEVEL_HEX, LEVEL_WORD, loadPostCard } from '@/lib/shareCards'
import ui from '@/components/ui/ui.module.css'
import OpenInApp from './OpenInApp'

// Share link for a Community post. Link previews get the post's own title,
// description and image (./opengraph-image.tsx). Signed-out visitors see a
// read-only copy of the post with a sign-up prompt; signed-in visitors are
// sent straight to it in the Community feed (OpenInApp).

export const revalidate = 300

const TYPE_LABEL = { found: 'Found it', looking: 'Looking for', post: 'Post' } as const

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const post = await loadPostCard(id).catch(() => null)
  if (!post) return { title: 'Post on AmpedMap' }
  const title = post.postType === 'found' && post.drink
    ? `@${post.username} found ${post.drink}${post.store ? ` at ${post.store.name}` : ''}`
    : post.postType === 'looking' && post.drink
      ? `@${post.username} is looking for ${post.drink}`
      : `@${post.username} on AmpedMap`
  const description = post.body.length > 160 ? `${post.body.slice(0, 157)}…` : post.body
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, url: `/p/${post.id}`, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function SharedPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const post = await loadPostCard(id).catch(() => null)
  if (!post) notFound()

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', padding: 'calc(env(safe-area-inset-top) + 24px) 16px 40px' }}>
      <OpenInApp postId={post.id} />
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: 'var(--text)', marginBottom: 22 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: '#C9F400', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9-11.6h-6.3L13.5 2z" fill="#0D1210" /></svg>
          </span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>AmpedMap</span>
        </Link>

        <article className={ui.card} style={{ padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            {post.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={post.avatarUrl} alt="" width={40} height={40} style={{ borderRadius: 20, objectFit: 'cover' }} />
              : <span style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(201,244,0,0.14)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{post.username[0]?.toUpperCase()}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 15, fontWeight: 600 }}>@{post.username}</p>
              <p style={{ fontSize: 13, color: 'var(--text-dim)' }}>{ago(post.createdAt)}</p>
            </div>
            {post.postType !== 'post' && (
              <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'rgba(201,244,0,0.14)', color: 'var(--accent-text)' }}>{TYPE_LABEL[post.postType]}</span>
            )}
          </div>

          {post.drink && (
            <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              {post.drink}
              {post.quantity && <span style={{ marginLeft: 8, fontSize: 14, color: post.quantity === 'full' ? 'var(--accent-text)' : LEVEL_HEX[post.quantity] }}>{LEVEL_WORD[post.quantity]}</span>}
            </p>
          )}
          <p style={{ fontSize: 15, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{post.body}</p>
          {post.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.photo} alt="" style={{ width: '100%', maxHeight: 420, objectFit: 'cover', borderRadius: 12, marginTop: 12 }} />
          )}
          {post.store && (
            <Link href={`/store/${post.store.id}`} style={{ display: 'block', marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'var(--fg-04)', border: '1px solid var(--fg-08)', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{post.store.name}</span>
              {post.store.address && <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>{post.store.address}</span>}
            </Link>
          )}
        </article>

        <div className={ui.card} style={{ marginTop: 14, padding: 18, textAlign: 'center' }}>
          <p style={{ fontSize: 17, fontWeight: 600 }}>Hunting energy drinks?</p>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '6px 0 14px', lineHeight: 1.5 }}>See what&apos;s in stock at stores near you, follow your favorite flavors and join the conversation. Free.</p>
          <Link href="/account?mode=signup" className={`${ui.btnPrimary} ${ui.btnBlock}`} style={{ textDecoration: 'none' }}>Join AmpedMap</Link>
          <Link href={`/account?mode=signin`} className={ui.linkQuiet} style={{ display: 'inline-block', marginTop: 12 }}>I already have an account</Link>
        </div>
      </div>
    </div>
  )
}
