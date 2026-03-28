'use client'

import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function dayLabel(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

// Parse @[Name](s:id) store mentions and @[Name](u:id) user mentions
// Legacy format @[Name](uuid) (no prefix) treated as store
function renderContent(content: string, isMe: boolean, onStoreClick: (storeId: string) => void) {
  const parts = content.split(/(@\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    const match = part.match(/^@\[([^\]]+)\]\(([^)]+)\)$/)
    if (match) {
      const [, name, rawId] = match
      const isUser = rawId.startsWith('u:')
      const id = rawId.replace(/^[su]:/, '')
      return (
        <span
          key={i}
          onClick={isUser ? undefined : (e) => { e.stopPropagation(); onStoreClick(id) }}
          style={{
            color: isMe ? 'rgba(255,255,255,0.95)' : '#22c55e',
            fontWeight: 700,
            textDecoration: isUser ? 'none' : 'underline',
            cursor: isUser ? 'default' : 'pointer',
          }}
        >
          @{name}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export default function CommunityPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const isAdmin = profile?.is_admin === true

  const bottomRef = useRef<HTMLDivElement>(null)
  const unreadRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const msgRefs = useRef<Record<string, HTMLElement | null>>({})
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastReadTimeRef = useRef<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('community_last_read') : null
  )

  const [messages, setMessages] = useState<any[]>([])
  const [pinnedMessage, setPinnedMessage] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [replyingTo, setReplyingTo] = useState<any | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [typingUsers, setTypingUsers] = useState<Record<string, { username: string; at: number }>>({})
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [rateLimited, setRateLimited] = useState(false)
  const [mentionMode, setMentionMode] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionSuggestions, setMentionSuggestions] = useState<{ type: 'store' | 'user'; id: string; name: string; subtitle?: string }[]>([])
  const [reportedMsgs, setReportedMsgs] = useState<Set<string>>(new Set())
  const recentSentRef = useRef<number[]>([])
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const COOLDOWN_SEC = 3
  const BURST_MAX = 5
  const BURST_WINDOW_MS = 60000

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  useEffect(() => {
    if (!user) return
    fetchAll()

    const msgChannel = supabase
      .channel('community-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as any
        const { data: p } = await supabase.from('profiles').select('username').eq('id', msg.user_id).single()
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev
          return [...prev, { ...msg, profile: p }]
        })
        if (!msg.reply_to_id) {
          setTimeout(() => {
            const c = scrollContainerRef.current
            if (c) c.scrollTop = c.scrollHeight
          }, 50)
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const updated = payload.new as any
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m))
        if (updated.pinned) {
          setMessages((prev) => {
            const full = prev.find((m) => m.id === updated.id)
            if (full) setPinnedMessage(full)
            return prev
          })
        } else if (!updated.pinned) {
          setPinnedMessage((p: any) => p?.id === updated.id ? null : p)
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        const id = (payload.old as any).id
        setMessages((prev) => prev.filter((m) => m.id !== id))
        setPinnedMessage((p: any) => p?.id === id ? null : p)
      })
      .subscribe()

    const typingChannel = supabase
      .channel('community-typing', { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
        setTypingUsers((prev) => ({
          ...prev,
          [payload.user_id]: { username: payload.username, at: Date.now() },
        }))
      })
      .subscribe()
    typingChannelRef.current = typingChannel

    const typingInterval = setInterval(() => {
      setTypingUsers((prev) => {
        const now = Date.now()
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => now - v.at < 3000))
        return Object.keys(next).length !== Object.keys(prev).length ? next : prev
      })
    }, 1000)

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(typingChannel)
      clearInterval(typingInterval)
    }
  }, [user])

  useLayoutEffect(() => {
    if (!loading) {
      const container = scrollContainerRef.current
      if (!container) return
      if (unreadRef.current) {
        const offset = unreadRef.current.offsetTop - container.offsetTop - 16
        container.scrollTop = Math.max(0, offset)
      } else {
        container.scrollTop = container.scrollHeight
      }
      localStorage.setItem('community_last_read', new Date().toISOString())
    }
  }, [loading])

  useEffect(() => {
    if (confirmDelete) {
      const t = setTimeout(() => setConfirmDelete(null), 4000)
      return () => clearTimeout(t)
    }
  }, [confirmDelete])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100)
    else setSearchQuery('')
  }, [searchOpen])

  // Mention autocomplete — query both users and stores
  useEffect(() => {
    if (!mentionMode) { setMentionSuggestions([]); return }
    const q = mentionQuery.toLowerCase()
    Promise.all([
      supabase.from('profiles').select('id, username').ilike('username', `%${q}%`).limit(4),
      supabase.from('stores').select('id, name, address').ilike('name', `%${q}%`).limit(5),
    ]).then(([{ data: users }, { data: stores }]) => {
      const userItems = (users ?? [])
        .filter((u) => u.id !== user?.id)
        .map((u) => ({ type: 'user' as const, id: u.id, name: u.username }))
      const storeItems = (stores ?? []).map((s) => ({
        type: 'store' as const,
        id: s.id,
        name: s.name,
        subtitle: s.address ?? undefined,
      }))
      setMentionSuggestions([...userItems, ...storeItems])
    })
  }, [mentionQuery, mentionMode])

  async function fetchAll() {
    const [{ data: msgs }, { data: pinned }] = await Promise.all([
      supabase.from('messages').select('*, profile:profiles(username)').order('created_at', { ascending: true }).limit(200),
      supabase.from('messages').select('*, profile:profiles(username)').eq('pinned', true).maybeSingle(),
    ])
    if (msgs) setMessages(msgs)
    if (pinned) setPinnedMessage(pinned)
    setLoading(false)
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function removePhoto() {
    setPhoto(null)
    setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function startReply(msg: any) {
    setReplyingTo(msg)
    inputRef.current?.focus()
  }

  function dismissKeyboard() {
    inputRef.current?.blur()
  }

  function insertMention(item: { type: 'store' | 'user'; id: string; name: string }) {
    const prefix = item.type === 'user' ? 'u' : 's'
    const newText = text.replace(/@\w*$/, `@[${item.name}](${prefix}:${item.id}) `)
    setText(newText)
    setMentionMode(false)
    setMentionQuery('')
    setMentionSuggestions([])
    inputRef.current?.focus()
  }

  function onTextChange(val: string) {
    setText(val)
    // Detect @mention
    const match = val.match(/@(\w*)$/)
    if (match) {
      setMentionMode(true)
      setMentionQuery(match[1])
    } else {
      setMentionMode(false)
      setMentionQuery('')
    }
    // Typing broadcast
    if (val.trim() && typingChannelRef.current && !typingThrottleRef.current) {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { username: profile?.username, user_id: user?.id },
      })
      typingThrottleRef.current = setTimeout(() => { typingThrottleRef.current = null }, 2000)
    }
  }

  function startCooldown(sec: number) {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    setCooldown(sec)
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          clearInterval(cooldownTimerRef.current!)
          cooldownTimerRef.current = null
          setRateLimited(false)
          return 0
        }
        return c - 1
      })
    }, 1000)
  }

  async function sendMessage() {
    if ((!text.trim() && !photo) || !user || sending || cooldown > 0) return

    const now = Date.now()
    recentSentRef.current = recentSentRef.current.filter((t) => now - t < BURST_WINDOW_MS)
    if (recentSentRef.current.length >= BURST_MAX) {
      const oldest = recentSentRef.current[0]
      const waitSec = Math.ceil((BURST_WINDOW_MS - (now - oldest)) / 1000)
      setRateLimited(true)
      startCooldown(waitSec)
      return
    }

    setSending(true)

    let photoUrl: string | null = null
    if (photo) {
      const ext = photo.name.split('.').pop() ?? 'jpg'
      const path = `${user.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('chat-photos').upload(path, photo)
      if (!error) {
        const { data: urlData } = supabase.storage.from('chat-photos').getPublicUrl(path)
        photoUrl = urlData.publicUrl
      }
    }

    const replyParentId = replyingTo?.id ?? null
    const { data: newMsg, error } = await supabase
      .from('messages')
      .insert({ user_id: user.id, content: text.trim() || null, photo_url: photoUrl, reply_to_id: replyParentId })
      .select('*')
      .single()

    if (newMsg && !error) {
      setMessages((prev) => {
        if (prev.find((m) => m.id === newMsg.id)) return prev
        return [...prev, { ...newMsg, profile: { username: profile?.username } }]
      })
      setTimeout(() => {
        const c = scrollContainerRef.current
        if (!c) return
        if (replyParentId && msgRefs.current[replyParentId]) {
          const offset = msgRefs.current[replyParentId]!.offsetTop - c.offsetTop - 16
          c.scrollTop = Math.max(0, offset)
        } else {
          c.scrollTop = c.scrollHeight
        }
      }, 80)
    }

    // Fire mention notifications
    if (newMsg && !error && text.trim()) {
      const mentionRegex = /@\[[^\]]+\]\(u:([^)]+)\)/g
      const mentionedIds = [...new Set([...text.matchAll(mentionRegex)].map((m) => m[1]))]
        .filter((id) => id !== user.id)
      if (mentionedIds.length > 0) {
        await supabase.from('notifications').insert(
          mentionedIds.map((uid) => ({
            user_id: uid,
            type: 'mention',
            message: `@${profile?.username} mentioned you in Community Chat`,
            read: false,
          }))
        )
      }
    }

    recentSentRef.current.push(Date.now())
    startCooldown(COOLDOWN_SEC)
    setText('')
    removePhoto()
    setReplyingTo(null)
    setSending(false)
  }

  async function deleteMessage(msgId: string) {
    if (confirmDelete !== msgId) { setConfirmDelete(msgId); return }
    setConfirmDelete(null)
    await supabase.from('messages').delete().eq('id', msgId)
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
  }

  async function pinMessage(msgId: string) {
    await supabase.from('messages').update({ pinned: false }).eq('pinned', true)
    await supabase.from('messages').update({ pinned: true }).eq('id', msgId)
    const msg = messages.find((m) => m.id === msgId)
    if (msg) setPinnedMessage(msg)
  }

  async function unpinMessage() {
    await supabase.from('messages').update({ pinned: false }).eq('pinned', true)
    setPinnedMessage(null)
  }

  async function reportMessage(msgId: string) {
    if (reportedMsgs.has(msgId)) return
    await supabase.from('message_reports').insert({ message_id: msgId, reported_by: user!.id })
    setReportedMsgs((prev) => new Set([...prev, msgId]))
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const msgMap: Record<string, any> = {}
  messages.forEach((m) => { msgMap[m.id] = m })

  function getRoot(id: string): string {
    const m = msgMap[id]
    if (!m || !m.reply_to_id) return id
    return getRoot(m.reply_to_id)
  }

  const replyMap: Record<string, any[]> = {}
  messages.forEach((m) => {
    if (m.reply_to_id) {
      const root = getRoot(m.reply_to_id)
      if (!replyMap[root]) replyMap[root] = []
      replyMap[root].push(m)
    }
  })
  const topLevel = messages.filter((m) => !m.reply_to_id)

  const activeTypers = Object.entries(typingUsers)
    .filter(([uid]) => uid !== user.id)
    .map(([, v]) => v.username)

  const searchResults = searchQuery.trim()
    ? messages.filter((m) => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : []

  function renderMessage(msg: any, isReply = false) {
    const isMe = msg.user_id === user!.id
    const username = isMe ? (profile?.username ?? msg.profile?.username) : msg.profile?.username
    const threadReplies = !isReply ? (replyMap[msg.id] ?? []) : []
    const isPendingDelete = confirmDelete === msg.id
    const isSearchMatch = searchQuery.trim() && msg.content?.toLowerCase().includes(searchQuery.toLowerCase())
    const alreadyReported = reportedMsgs.has(msg.id)

    return (
      <div key={msg.id} ref={(el) => { msgRefs.current[msg.id] = el }} style={{ marginBottom: isReply ? 4 : 14 }}>
        <div
          className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
          style={{
            paddingLeft: isReply ? (isMe ? 48 : 28) : (isMe ? 48 : 0),
            paddingRight: isReply ? (isMe ? 28 : 48) : (isMe ? 0 : 48),
          }}
        >
          {isReply && !isMe && (
            <div style={{ width: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.15)', marginRight: 8, alignSelf: 'stretch', flexShrink: 0 }} />
          )}

          <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}>
            <p className="font-semibold mb-1 px-1" style={{ color: isMe ? 'rgba(34,197,94,0.75)' : 'rgba(255,255,255,0.45)', fontSize: isReply ? 10 : 12 }}>
              {username}
            </p>

            <div
              style={{
                backgroundColor: isMe ? '#22c55e' : (isReply ? '#16162a' : '#1e1e2e'),
                borderRadius: isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                overflow: 'hidden',
                maxWidth: '100%',
                outline: isSearchMatch ? '2px solid #22c55e' : 'none',
              }}
            >
              {/* Reply quote */}
              {isReply && msg.reply_to_id && msgMap[msg.reply_to_id] && (
                <div className="mx-2 mt-2 px-3 py-1.5 rounded-xl" style={{ backgroundColor: isMe ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] font-bold mb-0.5" style={{ color: isMe ? 'rgba(255,255,255,0.65)' : '#22c55e' }}>
                    {msgMap[msg.reply_to_id].profile?.username}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: isMe ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.4)' }}>
                    {msgMap[msg.reply_to_id].content ?? '📷 Photo'}
                  </p>
                </div>
              )}
              {msg.photo_url && (
                <img src={msg.photo_url} alt="shared" onClick={() => setLightboxUrl(msg.photo_url)}
                  style={{ maxWidth: 240, maxHeight: 180, display: 'block', width: '100%', objectFit: 'cover', cursor: 'pointer' }} />
              )}
              {msg.content && (
                <p className="px-3.5 py-2.5" style={{ color: isMe ? '#fff' : 'rgba(255,255,255,0.9)', lineHeight: 1.5, margin: 0, fontSize: isReply ? 13 : 14 }}>
                  {renderContent(msg.content, isMe, (id) => router.push(`/store/${id}`))}
                </p>
              )}
            </div>

            {/* Actions row */}
            <div className={`flex items-center gap-2 mt-0.5 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{timeAgo(msg.created_at)}</span>
              <button onClick={() => startReply(msg)} className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>↩ Reply</button>
              {!isMe && (
                <button
                  onClick={() => reportMessage(msg.id)}
                  disabled={alreadyReported}
                  className="text-[10px]"
                  style={{ opacity: alreadyReported ? 0.35 : 0.5 }}
                  title={alreadyReported ? 'Reported' : 'Report message'}
                >
                  🚩
                </button>
              )}
              {isAdmin && (
                <button onClick={() => pinMessage(msg.id)} className="text-[10px]" style={{ opacity: 0.4 }} title="Pin message">
                  📌
                </button>
              )}
              {isMe && (
                <button onClick={() => deleteMessage(msg.id)} className="text-[10px] font-semibold" style={{ color: isPendingDelete ? '#ef4444' : 'rgba(255,255,255,0.2)' }}>
                  {isPendingDelete ? 'Tap again to delete' : '✕'}
                </button>
              )}
            </div>
          </div>

          {isReply && isMe && (
            <div style={{ width: 2, borderRadius: 99, backgroundColor: 'rgba(34,197,94,0.35)', marginLeft: 8, alignSelf: 'stretch', flexShrink: 0 }} />
          )}
        </div>

        {threadReplies.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {threadReplies.map((r) => renderMessage(r, true))}
          </div>
        )}
      </div>
    )
  }

  function renderWithSeparators() {
    let lastDay = ''
    let shownUnread = false
    const items: React.ReactNode[] = []

    topLevel.forEach((msg) => {
      const day = new Date(msg.created_at).toDateString()
      if (day !== lastDay) {
        lastDay = day
        items.push(
          <div key={`day-${day}`} className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
            <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.3)' }}>{dayLabel(msg.created_at)}</span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(255,255,255,0.07)' }} />
          </div>
        )
      }
      if (!shownUnread && lastReadTimeRef.current && new Date(msg.created_at) > new Date(lastReadTimeRef.current) && msg.user_id !== user!.id) {
        shownUnread = true
        items.push(
          <div key="unread-separator" ref={unreadRef} className="flex items-center gap-3 my-3">
            <div className="flex-1 h-px" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#22c55e' }}>New Messages</span>
            <div className="flex-1 h-px" style={{ backgroundColor: '#22c55e' }} />
          </div>
        )
      }
      items.push(renderMessage(msg, false))
    })

    return items
  }

  return (
    <div className="flex flex-col" style={{ height: '100dvh' }}>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.92)' }} onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="full" style={{ maxWidth: '100%', maxHeight: '90dvh', objectFit: 'contain', borderRadius: 12 }} />
          <button className="absolute top-12 right-5 w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} onClick={() => setLightboxUrl(null)}>
            <span className="text-white text-lg">✕</span>
          </button>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#070710' }}>
        <div className="flex items-center justify-between px-5 pb-3">
          <p className="text-base font-black text-white">Community Chat</p>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#22c55e' }} />
              <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>Live</span>
            </div>
            <button onClick={() => setSearchOpen((o) => !o)}>
              <span style={{ fontSize: 16, opacity: searchOpen ? 1 : 0.5 }}>🔍</span>
            </button>
          </div>
        </div>
        {searchOpen && (
          <div className="px-4 pb-3">
            <input ref={searchInputRef} type="text" className="w-full rounded-full px-4 py-2 text-sm text-white outline-none"
              style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)' }}
              placeholder="Search messages…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            {searchQuery.trim() && (
              <p className="text-[11px] mt-1.5 px-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Pinned message banner */}
      {pinnedMessage && (
        <div className="shrink-0 flex items-center gap-2.5 px-4 py-2.5" style={{ backgroundColor: 'rgba(34,197,94,0.07)', borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>📌</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold mb-0.5" style={{ color: '#22c55e' }}>Pinned · {pinnedMessage.profile?.username}</p>
            <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {pinnedMessage.content ?? '📷 Photo'}
            </p>
          </div>
          {isAdmin && (
            <button onClick={unpinMessage} className="text-white/25 text-sm shrink-0">✕</button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-3" style={{ paddingLeft: 12, paddingRight: 12 }} onClick={dismissKeyboard}>
        {loading ? (
          <div className="flex justify-center mt-10">
            <div className="w-7 h-7 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : searchOpen && searchQuery.trim() ? (
          searchResults.length === 0 ? (
            <div className="flex flex-col items-center gap-2 mt-20 text-center">
              <span style={{ fontSize: 36 }}>🔍</span>
              <p className="text-sm text-white/40">No messages found</p>
            </div>
          ) : (
            <div>{searchResults.map((msg) => renderMessage(msg, false))}</div>
          )
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 mt-20 text-center">
            <span style={{ fontSize: 44 }}>💬</span>
            <p className="text-base font-bold text-white">No messages yet</p>
            <p className="text-sm text-white/40">Be the first to say something!</p>
          </div>
        ) : (
          <div>{renderWithSeparators()}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {activeTypers.length > 0 && (
        <div className="px-4 py-1 shrink-0">
          <p className="text-[11px] italic" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {activeTypers.length === 1 ? `${activeTypers[0]} is typing…`
              : activeTypers.length === 2 ? `${activeTypers[0]} and ${activeTypers[1]} are typing…`
              : 'Several people are typing…'}
          </p>
        </div>
      )}

      {/* Input area */}
      <div className="shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#070710', paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
        {replyingTo && (
          <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="w-0.5 h-8 rounded-full shrink-0" style={{ backgroundColor: '#22c55e' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold" style={{ color: '#22c55e' }}>Replying to {(replyingTo.profile as any)?.username ?? profile?.username}</p>
              <p className="text-[11px] text-white/40 truncate">{replyingTo.content ?? '📷 Photo'}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-white/25 text-sm shrink-0">✕</button>
          </div>
        )}

        {photoPreview && (
          <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <img src={photoPreview} alt="preview" className="w-9 h-9 rounded-lg object-cover shrink-0" />
            <p className="text-xs text-white/40 flex-1 truncate">{photo?.name}</p>
            <button onClick={removePhoto} className="text-white/25 text-xs shrink-0">✕</button>
          </div>
        )}

        {/* @mention suggestions */}
        {mentionSuggestions.length > 0 && (
          <div className="mx-3 mb-2 rounded-2xl overflow-hidden" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)' }}>
            {mentionSuggestions.map((item, i) => (
              <button
                key={`${item.type}-${item.id}`}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                style={{ borderBottom: i < mentionSuggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}
                onMouseDown={(e) => { e.preventDefault(); insertMention(item) }}
              >
                <span style={{ fontSize: 14 }}>{item.type === 'user' ? '👤' : '🏪'}</span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-white">{item.name}</span>
                  {item.subtitle && (
                    <span className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>{item.subtitle}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {rateLimited && (
          <div className="px-4 py-1.5 mx-3 mt-2 rounded-xl" style={{ backgroundColor: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-[11px] font-semibold" style={{ color: '#ef4444' }}>Slow down — too many messages. Try again in {cooldown}s.</p>
          </div>
        )}

        <div className="flex items-center gap-2 px-3 pt-2.5">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <button onClick={() => fileInputRef.current?.click()} className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <span style={{ fontSize: 16 }}>📷</span>
          </button>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 rounded-full px-4 py-2.5 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)' }}
            placeholder={replyingTo ? 'Write a reply…' : 'Message… (@ to mention a store)'}
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          />
          <button
            onClick={sendMessage}
            disabled={(!text.trim() && !photo) || sending || cooldown > 0}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: cooldown > 0 ? 'rgba(239,68,68,0.35)' : ((!text.trim() && !photo) || sending ? 'rgba(34,197,94,0.3)' : '#22c55e') }}
          >
            {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : cooldown > 0 ? <span className="text-white font-black" style={{ fontSize: 11 }}>{cooldown}s</span>
              : <span className="text-white font-black" style={{ fontSize: 16 }}>↑</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
