'use client'

import { useEffect, useLayoutEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

const CHANNELS = [
  { id: 'general',     name: 'general',      icon: '💬', desc: 'General energy drink chat' },
  { id: 'finds',       name: 'finds',         icon: '🎯', desc: 'Share your latest finds' },
  { id: 'alerts',      name: 'stock-alerts',  icon: '🔔', desc: 'Live stock updates' },
  { id: 'reviews',     name: 'reviews',       icon: '⭐', desc: 'Rate and review flavors' },
  { id: 'new-flavors', name: 'new-flavors',   icon: '🆕', desc: 'New drops and releases' },
]

const QUICK_REACTIONS = ['⚡', '🔥', '👀', '💯', '🙌', '❤️']

const AVATAR_COLORS = [
  'linear-gradient(135deg, #22c55e, #16a34a)',
  'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  'linear-gradient(135deg, #a855f7, #7c3aed)',
  'linear-gradient(135deg, #f97316, #ea580c)',
  'linear-gradient(135deg, #ec4899, #be185d)',
  'linear-gradient(135deg, #06b6d4, #0284c7)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #10b981, #059669)',
]

const BUBBLE_COLORS = [
  { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.18)'  },
  { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.18)' },
  { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.18)' },
  { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.18)' },
  { bg: 'rgba(236,72,153,0.08)', border: 'rgba(236,72,153,0.18)' },
  { bg: 'rgba(6,182,212,0.08)',  border: 'rgba(6,182,212,0.18)'  },
  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.18)' },
  { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)' },
]

function bubbleColor(userId: string) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return BUBBLE_COLORS[hash % BUBBLE_COLORS.length]
}

function avatarColor(userId: string) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

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

function renderContent(content: string, onStoreClick: (id: string) => void) {
  const parts = content.split(/(@\[[^\]]+\]\([^)]+\))/g)
  return parts.map((part, i) => {
    const match = part.match(/^@\[([^\]]+)\]\(([^)]+)\)$/)
    if (match) {
      const [, name, rawId] = match
      const isUser = rawId.startsWith('u:')
      const id = rawId.replace(/^[su]:/, '')
      return (
        <span key={i}
          onClick={isUser ? undefined : (e) => { e.stopPropagation(); onStoreClick(id) }}
          style={{ color: '#22c55e', fontWeight: 700, textDecoration: isUser ? 'none' : 'underline', cursor: isUser ? 'default' : 'pointer' }}>
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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const msgRefs = useRef<Record<string, HTMLElement | null>>({})
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const typingThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastReadTimeRef = useRef<string | null>(
    typeof window !== 'undefined' ? localStorage.getItem('community_last_read') : null
  )

  const [activeChannel, setActiveChannel] = useState('general')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [channelUnread, setChannelUnread] = useState<Record<string, number>>(() => {
    if (typeof window === 'undefined') return {}
    try { return JSON.parse(localStorage.getItem('channel_unread') ?? '{}') } catch { return {} }
  })
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
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [reactingTo, setReactingTo] = useState<string | null>(null)
  const [reactingToPos, setReactingToPos] = useState<{ top: number; left: number } | null>(null)
  const [reactions, setReactions] = useState<Record<string, { emoji: string; count: number; byMe: boolean }[]>>({})
  const recentSentRef = useRef<number[]>([])
  const cooldownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const COOLDOWN_SEC = 3
  const BURST_MAX = 5
  const BURST_WINDOW_MS = 60000
  const currentChannel = CHANNELS.find((c) => c.id === activeChannel) ?? CHANNELS[0]

  // Persist unread to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('channel_unread', JSON.stringify(channelUnread))
  }, [channelUnread])

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
    if (!authLoading && user && profile && profile.tier !== 'tracker' && !profile.is_admin) router.replace('/')
  }, [user, profile, authLoading])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    setMessages([])
    setPinnedMessage(null)
    setReactions({})
    fetchAll()
    setChannelUnread((prev) => ({ ...prev, [activeChannel]: 0 }))
  }, [activeChannel, user])

  // On first load, sync per-channel unread counts from DB
  useEffect(() => {
    if (!user) return
    const lastRead = lastReadTimeRef.current ?? new Date(0).toISOString()
    Promise.all(
      CHANNELS.map((ch) =>
        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('channel', ch.id)
          .gt('created_at', lastRead)
          .neq('user_id', user.id)
          .then(({ count }) => ({ id: ch.id, count: count ?? 0 }))
      )
    ).then((results) => {
      setChannelUnread((prev) => {
        const next = { ...prev }
        results.forEach(({ id, count }) => {
          if (id !== activeChannel) next[id] = count
        })
        return next
      })
    })
  }, [user])

  useEffect(() => {
    if (!user) return
    const msgChannel = supabase
      .channel('community-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as any
        const { data: p } = await supabase.from('profiles').select('username, tier, is_verified_reporter').eq('id', msg.user_id).single()
        const incoming = { ...msg, profile: p }
        if (msg.channel === activeChannel) {
          setMessages((prev) => {
            if (prev.find((m) => m.id === msg.id)) return prev
            return [...prev, incoming]
          })
          setTimeout(() => {
            const c = scrollContainerRef.current
            if (!c) return
            const distFromBottom = c.scrollHeight - c.scrollTop - c.clientHeight
            if (distFromBottom < 200) {
              c.scrollTop = c.scrollHeight
              const now = new Date().toISOString()
              localStorage.setItem('community_last_read', now)
              lastReadTimeRef.current = now
            }
          }, 50)
        } else {
          setChannelUnread((prev) => ({ ...prev, [msg.channel]: (prev[msg.channel] ?? 0) + 1 }))
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
        const updated = payload.new as any
        if (updated.channel !== activeChannel) return
        setMessages((prev) => prev.map((m) => m.id === updated.id ? { ...m, ...updated } : m))
        if (updated.pinned) {
          setMessages((prev) => { const full = prev.find((m) => m.id === updated.id); if (full) setPinnedMessage(full); return prev })
        } else {
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
        if (payload.channel !== activeChannel) return
        setTypingUsers((prev) => ({ ...prev, [payload.user_id]: { username: payload.username, at: Date.now() } }))
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

    const reactionsChannel = supabase
      .channel('community-reactions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, (payload) => {
        const r = payload.new as any
        if (r.user_id === user!.id) return // already handled optimistically
        setReactions((prev) => {
          const c = prev[r.message_id] ?? []
          const ex = c.find((x) => x.emoji === r.type)
          if (ex) return { ...prev, [r.message_id]: c.map((x) => x.emoji === r.type ? { ...x, count: x.count + 1 } : x) }
          return { ...prev, [r.message_id]: [...c, { emoji: r.type, count: 1, byMe: false }] }
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, (payload) => {
        const r = payload.old as any
        if (!r.message_id || !r.type || r.user_id === user!.id) return // already handled optimistically
        setReactions((prev) => {
          const c = prev[r.message_id] ?? []
          const updated = c.map((x) => x.emoji === r.type ? { ...x, count: Math.max(0, x.count - 1) } : x).filter((x) => x.count > 0)
          return { ...prev, [r.message_id]: updated }
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(msgChannel); supabase.removeChannel(typingChannel); supabase.removeChannel(reactionsChannel); clearInterval(typingInterval) }
  }, [user, activeChannel])

  useLayoutEffect(() => {
    if (!loading) {
      const container = scrollContainerRef.current
      if (!container) return
      if (unreadRef.current) {
        container.scrollTop = Math.max(0, unreadRef.current.offsetTop - container.offsetTop - 16)
      } else {
        container.scrollTop = container.scrollHeight
      }
      const now = new Date().toISOString()
      localStorage.setItem('community_last_read', now)
      lastReadTimeRef.current = now
    }
  }, [loading])

  useEffect(() => {
    if (confirmDelete) { const t = setTimeout(() => setConfirmDelete(null), 4000); return () => clearTimeout(t) }
  }, [confirmDelete])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100)
    else setSearchQuery('')
  }, [searchOpen])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(distFromBottom > 120)
      // Mark everything as read when user is at (or near) the bottom
      if (distFromBottom < 60) {
        const now = new Date().toISOString()
        localStorage.setItem('community_last_read', now)
        lastReadTimeRef.current = now
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [loading])

  useEffect(() => {
    if (!mentionMode) { setMentionSuggestions([]); return }
    const q = mentionQuery.toLowerCase()
    Promise.all([
      supabase.from('profiles').select('id, username').ilike('username', `%${q}%`).limit(4),
      supabase.from('stores').select('id, name, address').ilike('name', `%${q}%`).limit(5),
    ]).then(([{ data: users }, { data: stores }]) => {
      setMentionSuggestions([
        ...(users ?? []).filter((u) => u.id !== user?.id).map((u) => ({ type: 'user' as const, id: u.id, name: u.username })),
        ...(stores ?? []).map((s) => ({ type: 'store' as const, id: s.id, name: s.name, subtitle: s.address ?? undefined })),
      ])
    })
  }, [mentionQuery, mentionMode])

  async function fetchAll() {
    try {
      const [{ data: msgs }, { data: pinned }] = await Promise.all([
        supabase.from('messages').select('*, profile:profiles(username, tier, is_verified_reporter)')
          .eq('channel', activeChannel).order('created_at', { ascending: true }).limit(200),
        supabase.from('messages').select('*, profile:profiles(username)')
          .eq('channel', activeChannel).eq('pinned', true).maybeSingle(),
      ])
      if (msgs) {
        setMessages(msgs)
        const ids = msgs.map((m: any) => m.id)
        if (ids.length > 0) {
          const { data: rxns, error: rxnErr } = await supabase.from('message_reactions').select('message_id, type, user_id').in('message_id', ids)
          if (rxnErr) console.error('reactions fetch error:', rxnErr.message)
          if (rxns) {
            const grouped: Record<string, { emoji: string; count: number; byMe: boolean }[]> = {}
            for (const r of rxns) {
              if (!grouped[r.message_id]) grouped[r.message_id] = []
              const ex = grouped[r.message_id].find((x) => x.emoji === r.type)
              if (ex) { ex.count++; if (r.user_id === user!.id) ex.byMe = true }
              else grouped[r.message_id].push({ emoji: r.type, count: 1, byMe: r.user_id === user!.id })
            }
            setReactions(grouped)
          }
        }
      }
      if (pinned) setPinnedMessage(pinned)
    } finally {
      setLoading(false)
    }
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function removePhoto() {
    setPhoto(null); setPhotoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function insertMention(item: { type: 'store' | 'user'; id: string; name: string }) {
    const newText = text.replace(/@\w*$/, `@[${item.name}](${item.type === 'user' ? 'u' : 's'}:${item.id}) `)
    setText(newText); setMentionMode(false); setMentionQuery(''); setMentionSuggestions([])
    inputRef.current?.focus()
  }

  function onTextChange(val: string) {
    setText(val)
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`
    }
    const match = val.match(/@(\w*)$/)
    if (match) { setMentionMode(true); setMentionQuery(match[1]) }
    else { setMentionMode(false); setMentionQuery('') }
    if (val.trim() && typingChannelRef.current && !typingThrottleRef.current) {
      typingChannelRef.current.send({ type: 'broadcast', event: 'typing', payload: { username: profile?.username, user_id: user?.id, channel: activeChannel } })
      typingThrottleRef.current = setTimeout(() => { typingThrottleRef.current = null }, 2000)
    }
  }

  function startCooldown(sec: number) {
    if (cooldownTimerRef.current) clearInterval(cooldownTimerRef.current)
    setCooldown(sec)
    cooldownTimerRef.current = setInterval(() => {
      setCooldown((c) => { if (c <= 1) { clearInterval(cooldownTimerRef.current!); cooldownTimerRef.current = null; setRateLimited(false); return 0 } return c - 1 })
    }, 1000)
  }

  async function sendMessage() {
    if ((!text.trim() && !photo) || !user || sending || cooldown > 0) return
    const now = Date.now()
    recentSentRef.current = recentSentRef.current.filter((t) => now - t < BURST_WINDOW_MS)
    if (recentSentRef.current.length >= BURST_MAX) {
      setRateLimited(true); startCooldown(Math.ceil((BURST_WINDOW_MS - (now - recentSentRef.current[0])) / 1000)); return
    }
    setSending(true)
    try {
      let photoUrl: string | null = null
      if (photo) {
        const EXT_MAP: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/heic': 'heic' }
        if (!EXT_MAP[photo.type]) return
        const path = `${user.id}/${Date.now()}.${EXT_MAP[photo.type]}`
        const { error } = await supabase.storage.from('chat-photos').upload(path, photo)
        if (!error) { const { data: u } = supabase.storage.from('chat-photos').getPublicUrl(path); photoUrl = u.publicUrl }
      }
      const { data: newMsg } = await supabase.from('messages')
        .insert({ user_id: user.id, content: text.trim() || null, photo_url: photoUrl, reply_to_id: replyingTo?.id ?? null, channel: activeChannel })
        .select('*').single()
      if (newMsg) {
        setMessages((prev) => prev.find((m) => m.id === newMsg.id) ? prev : [...prev, { ...newMsg, profile: { username: profile?.username, tier: profile?.tier, is_verified_reporter: profile?.is_verified_reporter } }])
        setTimeout(() => { const c = scrollContainerRef.current; if (c) c.scrollTop = c.scrollHeight }, 80)
        if (text.trim()) {
          const mentionedIds = [...new Set([...text.matchAll(/@\[[^\]]+\]\(u:([^)]+)\)/g)].map((m) => m[1]))].filter((id) => id !== user.id)
          if (mentionedIds.length > 0) {
            await supabase.from('notifications').insert(mentionedIds.map((uid) => ({ user_id: uid, type: 'mention', message: `@${profile?.username} mentioned you in #${currentChannel.name}`, read: false })))
          }
        }
      }
      recentSentRef.current.push(Date.now()); startCooldown(COOLDOWN_SEC)
      setText(''); removePhoto(); setReplyingTo(null)
      if (inputRef.current) inputRef.current.style.height = 'auto'
    } finally {
      setSending(false)
    }
  }

  async function deleteMessage(msgId: string) {
    if (confirmDelete !== msgId) { setConfirmDelete(msgId); return }
    setConfirmDelete(null)
    await supabase.from('messages').delete().eq('id', msgId).eq('user_id', user!.id)
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
  }

  async function pinMessage(msgId: string) {
    await supabase.from('messages').update({ pinned: false }).eq('pinned', true).eq('channel', activeChannel)
    await supabase.from('messages').update({ pinned: true }).eq('id', msgId)
    const msg = messages.find((m) => m.id === msgId); if (msg) setPinnedMessage(msg)
  }

  async function unpinMessage() {
    await supabase.from('messages').update({ pinned: false }).eq('pinned', true).eq('channel', activeChannel)
    setPinnedMessage(null)
  }

  async function reportMessage(msgId: string) {
    if (reportedMsgs.has(msgId)) return
    await supabase.from('message_reports').insert({ message_id: msgId, reported_by: user!.id })
    setReportedMsgs((prev) => new Set([...prev, msgId]))
  }

  async function addReaction(msgId: string, emoji: string) {
    if (!user) return
    setReactingTo(null)
    setReactingToPos(null)
    const cur = reactions[msgId] ?? []
    const existing = cur.find((r) => r.emoji === emoji)
    // Optimistic update
    setReactions((prev) => {
      const c = prev[msgId] ?? []
      if (existing?.byMe) {
        const updated = c.map((r) => r.emoji === emoji ? { ...r, count: r.count - 1 } : r).filter((r) => r.count > 0)
        return { ...prev, [msgId]: updated }
      } else if (existing) {
        return { ...prev, [msgId]: c.map((r) => r.emoji === emoji ? { ...r, count: r.count + 1, byMe: true } : r) }
      } else {
        return { ...prev, [msgId]: [...c, { emoji, count: 1, byMe: true }] }
      }
    })
    if (existing?.byMe) {
      await supabase.from('message_reactions').delete().eq('message_id', msgId).eq('user_id', user.id).eq('type', emoji)
    } else {
      await supabase.from('message_reactions').insert({ message_id: msgId, user_id: user.id, type: emoji })
    }
  }

  function switchChannel(id: string) {
    setActiveChannel(id); setSidebarOpen(false); setSearchOpen(false); setSearchQuery(''); setReplyingTo(null)
  }

  if (authLoading || !user || (user && !profile)) {
    return <div className="flex items-center justify-center h-screen bg-[#070710]"><div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" /></div>
  }

  const msgMap: Record<string, any> = {}
  messages.forEach((m) => { msgMap[m.id] = m })
  const activeTypers = Object.entries(typingUsers).filter(([uid]) => uid !== user.id).map(([, v]) => v.username)
  const searchResults = searchQuery.trim() ? messages.filter((m) => m.content?.toLowerCase().includes(searchQuery.toLowerCase())) : []
  const totalUnread = Object.values(channelUnread).reduce((a, b) => a + b, 0)

  function renderMessage(msg: any, idx: number, list: any[]) {
    const isMe = msg.user_id === user!.id
    const username = isMe ? (profile?.username ?? msg.profile?.username) : msg.profile?.username
    const prev = list[idx - 1]
    const grouped = prev && prev.user_id === msg.user_id && new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000
    const parentMsg = msg.reply_to_id ? msgMap[msg.reply_to_id] : null
    const isPendingDelete = confirmDelete === msg.id
    const isSearchMatch = searchQuery.trim() && msg.content?.toLowerCase().includes(searchQuery.toLowerCase())
    const msgReactions = reactions[msg.id] ?? []
    const initial = (username?.[0] ?? '?').toUpperCase()
    const color = avatarColor(msg.user_id ?? msg.id ?? '')
    const bubble = isMe
      ? { bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.28)' }
      : bubbleColor(msg.user_id ?? msg.id ?? '')

    return (
      <div key={msg.id} ref={(el) => { msgRefs.current[msg.id] = el as HTMLElement | null }}
        className="msg-row"
        style={{ display: 'flex', gap: 12, padding: `${grouped ? 2 : 10}px 16px`, background: isSearchMatch ? 'rgba(34,197,94,0.04)' : 'transparent', position: 'relative' }}>

        {/* Avatar */}
        <div style={{ width: 36, flexShrink: 0 }}>
          {!grouped && (
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#fff' }}>
              {initial}
            </div>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Reply quote */}
          {parentMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, paddingLeft: 4, borderLeft: '2px solid rgba(255,255,255,0.2)', opacity: 0.55 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>{parentMsg.profile?.username}</span>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parentMsg.content ?? '📷 Photo'}</span>
            </div>
          )}

          {/* Header */}
          {!grouped && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: isMe ? '#22c55e' : '#fff' }}>{username}</span>
              {isMe && <span style={{ fontSize: 9, fontWeight: 800, color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: '1px 6px' }}>YOU</span>}
              {msg.profile?.is_verified_reporter && <span style={{ fontSize: 9, fontWeight: 800, color: '#60a5fa', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: 8, padding: '1px 6px' }}>✓</span>}
              {msg.profile?.tier === 'hunter' && <span style={{ fontSize: 9, fontWeight: 800, color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 8, padding: '1px 6px' }}>⚡</span>}
              {msg.profile?.tier === 'tracker' && <span style={{ fontSize: 9, fontWeight: 800, color: '#f97316', backgroundColor: 'rgba(249,115,22,0.1)', borderRadius: 8, padding: '1px 6px' }}>🔥</span>}
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{timeAgo(msg.created_at)}</span>
            </div>
          )}

          {/* Bubble */}
          {(msg.photo_url || msg.content) && (
            <div style={{ display: 'inline-block', maxWidth: '100%', backgroundColor: bubble.bg, border: `1px solid ${bubble.border}`, borderRadius: grouped ? '4px 12px 12px 12px' : '12px', padding: '8px 12px', marginTop: grouped ? 0 : 2 }}>
              {msg.photo_url && (
                <img src={msg.photo_url} alt="shared" onClick={() => setLightboxUrl(msg.photo_url)}
                  style={{ maxWidth: 220, maxHeight: 160, display: 'block', objectFit: 'cover', borderRadius: 8, cursor: 'pointer', marginBottom: msg.content ? 6 : 0 }} />
              )}
              {msg.content && (
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', lineHeight: 1.6, wordBreak: 'break-word', margin: 0 }}>
                  {renderContent(msg.content, (id) => router.push(`/store/${id}`))}
                </p>
              )}
            </div>
          )}

          {/* Reactions */}
          {msgReactions.length > 0 && (
            <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
              {msgReactions.map((r, ri) => (
                <div key={ri} className="reaction-chip" onClick={() => addReaction(msg.id, r.emoji)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, backgroundColor: r.byMe ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)', border: r.byMe ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: '2px 8px', cursor: 'pointer' }}>
                  <span style={{ fontSize: 13 }}>{r.emoji}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>{r.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4, position: 'relative' }}>
            <button onClick={() => { setReplyingTo(msg); inputRef.current?.focus() }}
              style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6 }}>↩ Reply</button>
            {/* Emoji reaction button — always visible, works on mobile */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (reactingTo === msg.id) {
                  setReactingTo(null); setReactingToPos(null)
                } else {
                  const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                  setReactingTo(msg.id); setReactingToPos({ top: rect.top, left: rect.left })
                }
              }}
              style={{ fontSize: 13, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 6, opacity: 0.5 }}>😊</button>
            {!isMe && (
              <button onClick={() => reportMessage(msg.id)} disabled={reportedMsgs.has(msg.id)}
                style={{ fontSize: 11, color: reportedMsgs.has(msg.id) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 6 }}>🚩</button>
            )}
            {isAdmin && (
              <button onClick={() => pinMessage(msg.id)}
                style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 6 }}>📌</button>
            )}
            {isMe && (
              <button onClick={() => deleteMessage(msg.id)}
                style={{ fontSize: 11, fontWeight: 600, color: isPendingDelete ? '#ef4444' : 'rgba(255,255,255,0.2)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 6 }}>
                {isPendingDelete ? 'delete?' : '✕'}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderWithSeparators() {
    let lastDay = ''
    let shownUnread = false
    const items: React.ReactNode[] = []
    messages.forEach((msg, i) => {
      const day = new Date(msg.created_at).toDateString()
      if (day !== lastDay) {
        lastDay = day
        items.push(
          <div key={`day-${day}`} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 16px 8px' }}>
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5 }}>{dayLabel(msg.created_at)}</span>
            <div style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' }} />
          </div>
        )
      }
      if (!shownUnread && lastReadTimeRef.current && new Date(msg.created_at) > new Date(lastReadTimeRef.current) && msg.user_id !== user!.id) {
        shownUnread = true
        items.push(
          <div key="unread-sep" ref={unreadRef} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 16px' }}>
            <div style={{ flex: 1, height: 1, backgroundColor: '#22c55e' }} />
            <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', letterSpacing: 1.5 }}>NEW MESSAGES</span>
            <div style={{ flex: 1, height: 1, backgroundColor: '#22c55e' }} />
          </div>
        )
      }
      items.push(renderMessage(msg, i, messages))
    })
    return items
  }

  return (
    <div style={{ height: '100dvh', backgroundColor: '#070710', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: 'calc(56px + env(safe-area-inset-top))', paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
        @keyframes slideIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .channel-item { transition: background 0.15s ease; cursor: pointer; }
        .channel-item:hover { background: rgba(255,255,255,0.05) !important; }
        .msg-row:hover { background: rgba(255,255,255,0.02) !important; }
        .msg-row:hover .reaction-btn { opacity: 1 !important; }
        .reaction-btn { opacity: 0; transition: opacity 0.15s ease; }
        .reaction-chip:hover { transform: scale(1.1); }
      `}</style>

      {/* Background */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, background: 'radial-gradient(ellipse 60% 40% at 20% 20%, rgba(34,197,94,0.04) 0%, transparent 60%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, zIndex: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)', backgroundSize: '40px 40px', pointerEvents: 'none' }} />

      {/* Reaction picker — fixed so it's never clipped by scroll container overflow */}
      {reactingTo && reactingToPos && (
        <div style={{ position: 'fixed', left: reactingToPos.left, top: reactingToPos.top, transform: 'translateY(calc(-100% - 4px))', backgroundColor: '#1a1a2e', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '8px 10px', display: 'flex', gap: 6, zIndex: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', animation: 'slideIn 0.15s ease', whiteSpace: 'nowrap' }}>
          {QUICK_REACTIONS.map((emoji) => (
            <button key={emoji} onClick={() => addReaction(reactingTo, emoji)}
              style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: '2px 3px', borderRadius: 6 }}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.92)' }} onClick={() => setLightboxUrl(null)}>
          <img src={lightboxUrl} alt="full" style={{ maxWidth: '100%', maxHeight: '90dvh', objectFit: 'contain', borderRadius: 12 }} />
          <button style={{ position: 'absolute', top: 48, right: 20, width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer' }} onClick={() => setLightboxUrl(null)}>✕</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>

        {/* Sidebar drawer */}
        {sidebarOpen && (
          <>
            <div style={{ position: 'absolute', inset: 0, zIndex: 30, backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={() => setSidebarOpen(false)} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 220, zIndex: 40, backgroundColor: '#0a0a14', borderRight: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 14px 10px' }}>
                <p style={{ fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.25)', letterSpacing: 2 }}>CHANNELS</p>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
                {CHANNELS.map((ch) => {
                  const unread = channelUnread[ch.id] ?? 0
                  const isActive = ch.id === activeChannel
                  return (
                    <div key={ch.id} className="channel-item" onClick={() => switchChannel(ch.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, marginBottom: 2, backgroundColor: isActive ? 'rgba(34,197,94,0.1)' : 'transparent' }}>
                      <span style={{ fontSize: 15 }}>{ch.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? '#22c55e' : 'rgba(255,255,255,0.5)', flex: 1 }}>#{ch.name}</span>
                      {unread > 0 && (
                        <div style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff', padding: '0 5px' }}>
                          {unread > 99 ? '99+' : unread}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '12px 14px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#fff' }}>
                    {(profile?.username?.[0] ?? '?').toUpperCase()}
                  </div>
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', backgroundColor: '#22c55e', border: '2px solid #0a0a14' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{profile?.username}</p>
                  {profile?.tier === 'hunter' && <p style={{ fontSize: 10, color: 'rgba(34,197,94,0.7)', fontWeight: 600 }}>⚡ Hunter</p>}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Chat column */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {/* Channel header */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(7,7,16,0.95)', backdropFilter: 'blur(10px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <button onClick={() => setSidebarOpen(true)}
                style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 }}>
                <span style={{ fontSize: 15, opacity: 0.6 }}>☰</span>
                {totalUnread > 0 && (
                  <div style={{ position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: '#22c55e', fontSize: 8, fontWeight: 900, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </div>
                )}
              </button>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}>{currentChannel.icon}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#fff' }}>#{currentChannel.name}</span>
                </div>
                {!searchOpen && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{currentChannel.desc}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 20, padding: '4px 10px' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#22c55e', animation: 'pulse 2s ease-in-out infinite' }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Live</span>
              </div>
              <button onClick={() => setSearchOpen((o) => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: searchOpen ? 1 : 0.5 }}>🔍</button>
            </div>
          </div>

          {/* Search bar */}
          {searchOpen && (
            <div style={{ flexShrink: 0, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: '#070710' }}>
              <input ref={searchInputRef} type="text" placeholder="Search messages…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 14px', color: '#fff', fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none' }} />
              {searchQuery.trim() && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>}
            </div>
          )}

          {/* Pinned message */}
          {pinnedMessage && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', backgroundColor: 'rgba(34,197,94,0.07)', borderBottom: '1px solid rgba(34,197,94,0.15)' }}>
              <span style={{ fontSize: 13, flexShrink: 0 }}>📌</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: '#22c55e', marginBottom: 1 }}>Pinned · {pinnedMessage.profile?.username}</p>
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pinnedMessage.content ?? '📷 Photo'}</p>
              </div>
              {isAdmin && <button onClick={unpinMessage} style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>}
            </div>
          )}

          {/* Messages */}
          <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: 8 }} onClick={() => { setReactingTo(null); setReactingToPos(null) }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 48 }}>
                <div className="w-7 h-7 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : searchOpen && searchQuery.trim() ? (
              searchResults.length === 0
                ? <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: 80 }}><span style={{ fontSize: 36 }}>🔍</span><p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No messages found</p></div>
                : <div>{searchResults.map((msg, i) => renderMessage(msg, i, searchResults))}</div>
            ) : messages.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, paddingTop: 80, textAlign: 'center' }}>
                <span style={{ fontSize: 44 }}>{currentChannel.icon}</span>
                <p style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>#{currentChannel.name}</p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Be the first to post here!</p>
              </div>
            ) : (
              <div>{renderWithSeparators()}</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Typing indicator */}
          {activeTypers.length > 0 && (
            <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px' }}>
              <div style={{ width: 36 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', gap: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '6px 10px' }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.4)', animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                  {activeTypers.length === 1 ? `${activeTypers[0]} is typing…` : activeTypers.length === 2 ? `${activeTypers[0]} and ${activeTypers[1]} are typing…` : 'Several people are typing…'}
                </span>
              </div>
            </div>
          )}

          {/* Scroll to bottom */}
          {showScrollBtn && (
            <div style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '4px 0', zIndex: 10 }}>
              <button onClick={() => { const c = scrollContainerRef.current; if (c) c.scrollTop = c.scrollHeight }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderRadius: 20, backgroundColor: '#22c55e', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(34,197,94,0.35)' }}>
                ↓ Latest messages
              </button>
            </div>
          )}

          {/* Input area */}
          <div style={{ flexShrink: 0, borderTop: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(7,7,16,0.95)' }}>
            {replyingTo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <div style={{ width: 2, height: 32, borderRadius: 99, backgroundColor: '#22c55e', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>Replying to {replyingTo.profile?.username ?? profile?.username}</p>
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{replyingTo.content ?? '📷 Photo'}</p>
                </div>
                <button onClick={() => setReplyingTo(null)} style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            )}
            {photoPreview && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <img src={photoPreview} alt="preview" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
                <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{photo?.name}</p>
                <button onClick={removePhoto} style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
              </div>
            )}
            {mentionSuggestions.length > 0 && (
              <div style={{ margin: '0 12px 8px', borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)' }}>
                {mentionSuggestions.map((item, i) => (
                  <button key={`${item.type}-${item.id}`} onMouseDown={(e) => { e.preventDefault(); insertMention(item) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: i < mentionSuggestions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 14 }}>{item.type === 'user' ? '👤' : '🏪'}</span>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>{item.name}</p>
                      {item.subtitle && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{item.subtitle}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {rateLimited && (
              <div style={{ margin: '0 12px 6px', padding: '8px 14px', borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>Slow down — too many messages. Try again in {cooldown}s.</p>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: '10px 12px' }}>
              <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
              <button onClick={() => fileInputRef.current?.click()}
                style={{ width: 36, height: 36, borderRadius: '50%', backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 16 }}>
                📷
              </button>
              <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '8px 12px' }}>
                <textarea ref={inputRef} value={text} onChange={(e) => onTextChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder={replyingTo ? 'Write a reply…' : `Message #${currentChannel.name}… (@ to mention)`}
                  rows={1}
                  style={{ width: '100%', background: 'none', border: 'none', color: '#fff', fontSize: 14, fontFamily: "'DM Sans', sans-serif", resize: 'none', lineHeight: 1.5, maxHeight: 120, overflowY: 'auto', outline: 'none' }} />
              </div>
              <button onClick={sendMessage} disabled={(!text.trim() && !photo) || sending || cooldown > 0}
                style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, background: cooldown > 0 ? 'rgba(239,68,68,0.35)' : (!text.trim() && !photo) || sending ? 'rgba(34,197,94,0.3)' : '#22c55e', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: text.trim() || photo ? '0 2px 10px rgba(34,197,94,0.3)' : 'none' }}>
                {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : cooldown > 0 ? <span style={{ fontSize: 11, fontWeight: 900, color: '#fff' }}>{cooldown}s</span>
                  : <span style={{ fontSize: 16, color: '#fff', fontWeight: 900 }}>↑</span>}
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', paddingLeft: 16, paddingBottom: 4 }}>Enter to send · Shift+Enter for newline · @ to mention</p>
          </div>
        </div>
      </div>
    </div>
  )
}
