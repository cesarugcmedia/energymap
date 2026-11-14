'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PinIcon, CommentIcon, BellIcon, ChevronRightIcon, DrinkIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'
import { Avatar, RichText } from './RichText'
import Lightbox from './Lightbox'
import { StorePicker } from './Pickers'
import { QUANTITY_STYLE, timeAgo, type FeedComment, type FeedPost, type StoreSummary } from './types'

const MAX_COMMENT = 300

export interface PostCardProps {
  post: FeedPost
  comments: FeedComment[]
  meId: string
  v3: boolean
  storeSummary?: StoreSummary
  highlighted?: boolean
  topWeekly?: boolean
  isFollowing: boolean
  drinkFollowed: boolean
  onToggleLike: (post: FeedPost) => void
  onToggleFollow: (userId: string) => void
  onFollowDrink: (drinkId: string) => void
  onShare: (post: FeedPost) => void
  onDelete: (post: FeedPost) => void
  onReport: (post: FeedPost, comment?: FeedComment) => void
  onBlock: (userId: string, username: string) => void
  onComment: (postId: string, body: string, parentId: string | null, store: { id: string; name: string } | null) => Promise<boolean>
  onDeleteComment: (comment: FeedComment) => void
}

const TYPE_LABEL: Record<string, { text: string; color: string }> = {
  found: { text: 'Found it', color: 'var(--accent-text)' },
  looking: { text: 'Looking for', color: '#FFB300' },
}

export default function PostCard(p: PostCardProps) {
  const { post } = p
  const router = useRouter()
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<FeedComment | null>(null)
  const [answerStore, setAnswerStore] = useState<{ id: string; name: string; address: string | null } | null>(null)
  const [sending, setSending] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [likeAnim, setLikeAnim] = useState(0)

  const isMe = post.user_id === p.meId
  const typeLabel = TYPE_LABEL[post.post_type]
  const topLevel = p.comments.filter((c) => !c.parent_id)
  const repliesOf = (id: string) => p.comments.filter((c) => c.parent_id === id)

  async function send() {
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    const ok = await p.onComment(post.id, body, replyTo?.id ?? null, answerStore ? { id: answerStore.id, name: answerStore.name } : null)
    if (ok) { setDraft(''); setReplyTo(null); setAnswerStore(null) }
    setSending(false)
  }

  const menuItem: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: 'none', border: 'none', fontFamily: 'inherit', fontSize: 15, cursor: 'pointer', color: 'var(--text)' }

  function renderComment(c: FeedComment, isReply = false) {
    const mine = c.user_id === p.meId
    return (
      <div key={c.id} style={{ display: 'flex', gap: 8, marginLeft: isReply ? 32 : 0 }}>
        <Link href={`/u/${c.username}`} style={{ textDecoration: 'none' }}><Avatar name={c.username} size={isReply ? 22 : 26} /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.45 }}>
            <Link href={`/u/${c.username}`} style={{ fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>@{c.username}</Link>{' '}
            <RichText text={c.body} style={{ display: 'inline', fontSize: 14, color: 'var(--text-muted)' }} />
          </div>
          {c.store && (
            <button onClick={() => router.push(`/store/${c.store!.id}?name=${encodeURIComponent(c.store!.name)}`)} style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8, background: 'var(--fg-06)', border: 'none', color: 'var(--accent-text)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
              <PinIcon size={11} color="var(--accent)" /> {c.store.name}
            </button>
          )}
          <div style={{ display: 'flex', gap: 12, marginTop: 3, fontSize: 12, color: 'var(--text-dim)' }}>
            <span>{timeAgo(c.created_at)}</span>
            {p.v3 && !isReply && <button onClick={() => { setReplyTo(c); setDraft((d) => d || `@${c.username} `) }} style={linkBtn}>Reply</button>}
            {mine ? <button onClick={() => p.onDeleteComment(c)} style={linkBtn}>Delete</button>
              : p.v3 && <button onClick={() => p.onReport(post, c)} style={linkBtn}>Report</button>}
          </div>
        </div>
      </div>
    )
  }

  return (
    <article
      id={`post-${post.id}`}
      className={`${ui.card} reveal`}
      style={{
        borderColor: p.highlighted ? '#C9F400' : undefined,
        boxShadow: p.highlighted ? '0 0 0 2px rgba(201,244,0,0.25)' : undefined,
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Link href={`/u/${post.username}`} style={{ textDecoration: 'none' }}><Avatar name={post.username} /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Link href={`/u/${post.username}`} style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', textDecoration: 'none' }}>@{post.username}</Link>
            {p.topWeekly && <span style={{ fontSize: 11, fontWeight: 700, color: '#ffd700', background: 'rgba(255,215,0,0.12)', borderRadius: 6, padding: '2px 6px' }}>Top 10</span>}
          </div>
          <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>{timeAgo(post.created_at)}</span>
        </div>
        {!isMe && (
          <button className={p.isFollowing ? ui.btnGhost : ui.btnSecondary} style={{ minHeight: 32, padding: '5px 12px', fontSize: 13 }} onClick={() => p.onToggleFollow(post.user_id)}>
            {p.isFollowing ? 'Following' : 'Follow'}
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <button aria-label="More options" onClick={() => setMenuOpen((o) => !o)} style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: 'none', color: 'var(--text-dim)', fontSize: 20, lineHeight: 1, cursor: 'pointer' }}>⋯</button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 25 }} />
              <div className="anim-rise" style={{ position: 'absolute', right: 0, top: 34, zIndex: 30, minWidth: 180, background: 'var(--surface3)', border: '1px solid var(--fg-10)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {isMe ? (
                  <button style={{ ...menuItem, color: '#FF6B6B' }} onClick={() => { setMenuOpen(false); p.onDelete(post) }}>Delete post</button>
                ) : (
                  <>
                    <Link href={`/u/${post.username}`} style={{ ...menuItem, textDecoration: 'none' }}>View profile</Link>
                    {p.v3 && <button style={menuItem} onClick={() => { setMenuOpen(false); p.onReport(post) }}>Report post</button>}
                    {p.v3 && <button style={{ ...menuItem, color: '#FF6B6B' }} onClick={() => { setMenuOpen(false); p.onBlock(post.user_id, post.username) }}>Block @{post.username}</button>}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Type label + drink tag */}
      {(typeLabel || post.drink) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          {typeLabel && <span style={{ fontSize: 12, fontWeight: 700, color: typeLabel.color, background: `${typeLabel.color}1a`, borderRadius: 6, padding: '3px 8px' }}>{typeLabel.text}</span>}
          {post.drink && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 4px 3px 9px', borderRadius: 8, background: 'var(--fg-06)', fontSize: 14, color: 'var(--text)' }}>
              <DrinkIcon size={13} color="var(--text-muted)" />
              {post.drink.brand} {post.drink.flavor}
              {post.quantity && <em style={{ fontStyle: 'normal', fontSize: 12, fontWeight: 700, color: QUANTITY_STYLE[post.quantity]?.color }}>{QUANTITY_STYLE[post.quantity]?.label}</em>}
              <button
                onClick={() => !p.drinkFollowed && p.onFollowDrink(post.drink!.id)}
                aria-label={p.drinkFollowed ? 'Following this flavor' : 'Follow this flavor'}
                title={p.drinkFollowed ? 'You’ll be alerted when it restocks' : 'Get alerted when it restocks'}
                style={{ width: 26, height: 26, borderRadius: 7, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: p.drinkFollowed ? 'rgba(201,244,0,0.14)' : 'transparent', cursor: p.drinkFollowed ? 'default' : 'pointer' }}
              >
                <span className={p.drinkFollowed ? 'anim-wiggle' : ''} style={{ display: 'flex' }}><BellIcon size={13} color={p.drinkFollowed ? 'var(--accent-text)' : 'var(--text-dim)'} filled={p.drinkFollowed} /></span>
              </button>
            </span>
          )}
        </div>
      )}

      {/* Body */}
      <RichText text={post.body} style={{ fontSize: 15, color: 'var(--text)', lineHeight: 1.5 }} />

      {/* Photos */}
      {post.photos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: post.photos.length === 1 ? '1fr' : '1fr 1fr', gap: 4, marginTop: 10, borderRadius: 12, overflow: 'hidden' }}>
          {post.photos.map((src, i) => (
            <button key={src} onClick={() => setLightbox(i)} aria-label="Open photo" style={{ padding: 0, border: 'none', background: 'var(--fg-06)', cursor: 'zoom-in', gridColumn: post.photos.length === 3 && i === 0 ? 'span 2' : undefined }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" style={{ width: '100%', height: post.photos.length === 1 ? 'auto' : 150, maxHeight: 360, objectFit: 'cover', display: 'block' }} />
            </button>
          ))}
        </div>
      )}

      {/* Store card with live stock summary */}
      {post.store && (
        <button
          onClick={() => router.push(`/store/${post.store!.id}?name=${encodeURIComponent(post.store!.name)}`)}
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--fg-04)', border: '1px solid var(--fg-08)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
        >
          <PinIcon size={16} color="var(--accent)" />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{post.store.name}</span>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.storeSummary && p.storeSummary.total > 0
                ? `${p.storeSummary.inStock} in stock${p.storeSummary.latest ? ` · ${timeAgo(p.storeSummary.latest)}` : ''}`
                : post.store.address ?? 'No reports yet'}
            </span>
          </span>
          <ChevronRightIcon size={15} color="var(--text-dim)" />
        </button>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 10, marginLeft: -8 }}>
        <button
          onClick={() => { if (!post.likedByMe) setLikeAnim((n) => n + 1); p.onToggleLike(post) }}
          aria-label={post.likedByMe ? 'Unlike' : 'Like'}
          style={{ ...actionBtn, color: post.likedByMe ? 'var(--accent-text)' : 'var(--text-muted)' }}
        >
          <span key={likeAnim} className={likeAnim > 0 && post.likedByMe ? 'anim-pop' : ''} style={{ display: 'flex', fontSize: 15 }}>{post.likedByMe ? '▲' : '△'}</span>
          <span>{post.likeCount}</span>
        </button>
        <button onClick={() => setCommentsOpen((o) => !o)} style={{ ...actionBtn, color: commentsOpen ? 'var(--accent-text)' : 'var(--text-muted)' }}>
          <CommentIcon size={14} color={commentsOpen ? 'var(--accent)' : 'var(--text-muted)'} />
          <span>{p.comments.length}{post.post_type === 'looking' && p.comments.length === 0 ? ' · Help out' : ''}</span>
        </button>
        <button onClick={() => p.onShare(post)} style={{ ...actionBtn, color: 'var(--text-muted)' }}>
          <span style={{ fontSize: 14 }}>↗</span><span>Share</span>
        </button>
      </div>

      {/* Comments */}
      {commentsOpen && (
        <div className="anim-rise" style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--fg-07)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {topLevel.map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {renderComment(c)}
              {repliesOf(c.id).map((r) => renderComment(r, true))}
            </div>
          ))}

          {replyTo && (
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              Replying to @{replyTo.username} · <button style={linkBtn} onClick={() => setReplyTo(null)}>Cancel</button>
            </div>
          )}
          {p.v3 && post.post_type === 'looking' && !isMe && (
            <StorePicker value={answerStore} onChange={setAnswerStore} placeholder="Seen it? Tag the store (optional)" />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className={ui.input}
              style={{ fontSize: 15, padding: '9px 12px' }}
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, MAX_COMMENT))}
              onKeyDown={(e) => { if (e.key === 'Enter') send() }}
              placeholder={post.post_type === 'looking' && !isMe ? 'Where did you see it?' : 'Add a comment…'}
            />
            <button className={ui.btnPrimary} style={{ minHeight: 40 }} onClick={send} disabled={!draft.trim() || sending}>
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {lightbox !== null && <Lightbox photos={post.photos} start={lightbox} onClose={() => setLightbox(null)} />}
    </article>
  )
}

const actionBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '6px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: 'inherit' }
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, fontSize: 12, color: 'var(--text-dim)', cursor: 'pointer', fontFamily: 'inherit' }
