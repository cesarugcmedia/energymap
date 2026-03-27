'use client'

import { useEffect, useState, useRef } from 'react'
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

function TierBadge({ tier }: { tier: string | null }) {
  if (tier === 'tracker') return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>🎯</span>
  )
  if (tier === 'hunter') return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>⚡</span>
  )
  return null
}

export default function CommunityPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [messages, setMessages] = useState<any[]>([])
  const [reactions, setReactions] = useState<Record<string, { likes: number; dislikes: number; mine: 'like' | 'dislike' | null }>>({})
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [replyingTo, setReplyingTo] = useState<any | null>(null)

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
        const [{ data: p }, { data: replyData }] = await Promise.all([
          supabase.from('profiles').select('username, tier, is_verified_reporter').eq('id', msg.user_id).single(),
          msg.reply_to_id
            ? supabase.from('messages').select('id, content, photo_url, profile:profiles(username)').eq('id', msg.reply_to_id).single()
            : Promise.resolve({ data: null }),
        ])
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev
          return [...prev, { ...msg, profile: p, reply: replyData }]
        })
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id))
      })
      .subscribe()

    const rxChannel = supabase
      .channel('community-reactions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        fetchReactions()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(rxChannel)
    }
  }, [user])

  useEffect(() => {
    if (!loading) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
  }, [loading])

  async function fetchAll() {
    const [{ data: msgs }, { data: rxData }] = await Promise.all([
      supabase
        .from('messages')
        .select('*, profile:profiles(username, tier, is_verified_reporter), reply:messages!reply_to_id(id, content, photo_url, profile:profiles(username))')
        .order('created_at', { ascending: true })
        .limit(100),
      supabase.from('message_reactions').select('message_id, user_id, type'),
    ])
    if (msgs) setMessages(msgs)
    if (rxData) buildReactions(rxData)
    setLoading(false)
  }

  async function fetchReactions() {
    const { data } = await supabase.from('message_reactions').select('message_id, user_id, type')
    if (data) buildReactions(data)
  }

  function buildReactions(rxData: any[]) {
    const map: Record<string, { likes: number; dislikes: number; mine: 'like' | 'dislike' | null }> = {}
    rxData.forEach((rx) => {
      if (!map[rx.message_id]) map[rx.message_id] = { likes: 0, dislikes: 0, mine: null }
      if (rx.type === 'like') map[rx.message_id].likes++
      else map[rx.message_id].dislikes++
      if (rx.user_id === user?.id) map[rx.message_id].mine = rx.type
    })
    setReactions(map)
  }

  async function toggleReaction(msgId: string, type: 'like' | 'dislike') {
    if (!user) return
    const current = reactions[msgId]?.mine
    if (current === type) {
      await supabase.from('message_reactions').delete().eq('message_id', msgId).eq('user_id', user.id)
    } else {
      await supabase.from('message_reactions').upsert({ message_id: msgId, user_id: user.id, type }, { onConflict: 'message_id,user_id' })
    }
    fetchReactions()
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

  async function sendMessage() {
    if ((!text.trim() && !photo) || !user || sending) return
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

    const { data: newMsg, error } = await supabase.from('messages').insert({
      user_id: user.id,
      content: text.trim() || null,
      photo_url: photoUrl,
      reply_to_id: replyingTo?.id ?? null,
    }).select('*, reply:messages!reply_to_id(id, content, photo_url, profile:profiles(username))').single()

    if (newMsg && !error) {
      setMessages((prev) => {
        if (prev.find((m) => m.id === newMsg.id)) return prev
        return [...prev, { ...newMsg, profile: { username: profile?.username, tier: profile?.tier, is_verified_reporter: profile?.is_verified_reporter } }]
      })
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }

    setText('')
    removePhoto()
    setReplyingTo(null)
    setSending(false)
  }

  async function deleteMessage(msgId: string) {
    await supabase.from('messages').delete().eq('id', msgId)
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
  }

  if (authLoading || !user) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0a0a0f]">
        <div className="w-8 h-8 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const inputAreaHeight = 64 + (photoPreview ? 60 : 0) + (replyingTo ? 52 : 0)

  return (
    <div className="bg-[#0a0a0f] flex flex-col" style={{ height: '100dvh' }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 shrink-0"
        style={{
          paddingTop: 'calc(56px + env(safe-area-inset-top))',
          paddingBottom: 14,
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          backgroundColor: '#0a0a0f',
        }}
      >
        <div>
          <p className="text-xl font-black text-white">💬 Community</p>
          <p className="text-xs text-white/40 mt-0.5">{messages.length} message{messages.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#22c55e' }} />
          <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>Live</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {loading ? (
          <div className="flex justify-center mt-10">
            <div className="w-7 h-7 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 mt-20 text-center">
            <span style={{ fontSize: 48 }}>💬</span>
            <p className="text-lg font-bold text-white">No messages yet</p>
            <p className="text-sm text-white/40">Be the first to say something!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === user.id
            const p = (isMe && !msg.profile?.username)
              ? { username: profile?.username, tier: profile?.tier, is_verified_reporter: profile?.is_verified_reporter }
              : msg.profile as any
            const reply = msg.reply as any
            const rx = reactions[msg.id] ?? { likes: 0, dislikes: 0, mine: null }

            return (
              <div key={msg.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>

                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 self-end mb-7"
                  style={{ backgroundColor: isMe ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)' }}
                >
                  <span className="text-xs font-black" style={{ color: isMe ? '#22c55e' : 'rgba(255,255,255,0.6)' }}>
                    {p?.username?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>

                <div className={`flex flex-col gap-1 max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>

                  {/* Name row */}
                  <div className={`flex items-center gap-1.5 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-xs font-bold" style={{ color: isMe ? '#22c55e' : 'rgba(255,255,255,0.65)' }}>
                      @{p?.username ?? 'unknown'}
                    </span>
                    {p?.is_verified_reporter && (
                      <span className="text-[9px] font-bold px-1 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.25)' }}>✓</span>
                    )}
                    <TierBadge tier={p?.tier} />
                    <span className="text-[10px] text-white/25">{timeAgo(msg.created_at)}</span>
                  </div>

                  {/* Bubble */}
                  <div
                    style={{
                      backgroundColor: isMe ? 'rgba(34,197,94,0.1)' : '#1a1a24',
                      border: `1px solid ${isMe ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Reply quote */}
                    {reply && (
                      <div
                        className="px-3 pt-2.5 pb-2"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' }}
                      >
                        <p className="text-[10px] font-bold mb-0.5" style={{ color: '#a78bfa' }}>
                          ↩ @{(reply.profile as any)?.username ?? 'unknown'}
                        </p>
                        {reply.content && (
                          <p className="text-xs text-white/50 truncate">{reply.content}</p>
                        )}
                        {!reply.content && reply.photo_url && (
                          <p className="text-xs text-white/40 italic">📷 Photo</p>
                        )}
                      </div>
                    )}

                    {/* Photo */}
                    {msg.photo_url && (
                      <img
                        src={msg.photo_url}
                        alt="shared"
                        className="w-full object-cover"
                        style={{ maxWidth: 260, maxHeight: 200, display: 'block' }}
                      />
                    )}

                    {/* Text */}
                    {msg.content && (
                      <p className="text-sm text-white px-3.5 py-2.5" style={{ lineHeight: 1.55 }}>
                        {msg.content}
                      </p>
                    )}
                  </div>

                  {/* Actions row */}
                  <div className={`flex items-center gap-2 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Like */}
                    <button
                      onClick={() => toggleReaction(msg.id, 'like')}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{
                        backgroundColor: rx.mine === 'like' ? 'rgba(34,197,94,0.15)' : 'transparent',
                        border: `1px solid ${rx.mine === 'like' ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      <span style={{ fontSize: 12 }}>👍</span>
                      {rx.likes > 0 && <span className="text-[11px] font-bold" style={{ color: rx.mine === 'like' ? '#22c55e' : 'rgba(255,255,255,0.4)' }}>{rx.likes}</span>}
                    </button>

                    {/* Dislike */}
                    <button
                      onClick={() => toggleReaction(msg.id, 'dislike')}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{
                        backgroundColor: rx.mine === 'dislike' ? 'rgba(239,68,68,0.12)' : 'transparent',
                        border: `1px solid ${rx.mine === 'dislike' ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      <span style={{ fontSize: 12 }}>👎</span>
                      {rx.dislikes > 0 && <span className="text-[11px] font-bold" style={{ color: rx.mine === 'dislike' ? '#ef4444' : 'rgba(255,255,255,0.4)' }}>{rx.dislikes}</span>}
                    </button>

                    {/* Reply */}
                    <button
                      onClick={() => startReply(msg)}
                      className="flex items-center gap-1 rounded-full px-2 py-0.5"
                      style={{ border: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <span className="text-[11px] text-white/40">↩ Reply</span>
                    </button>

                    {/* Delete own */}
                    {isMe && (
                      <button onClick={() => deleteMessage(msg.id)}>
                        <span className="text-[10px] text-white/20">✕</span>
                      </button>
                    )}
                  </div>

                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        className="shrink-0"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          backgroundColor: '#0a0a0f',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 76px)',
        }}
      >
        {/* Reply preview */}
        {replyingTo && (
          <div
            className="flex items-center gap-2 px-4 py-2.5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(139,92,246,0.05)' }}
          >
            <span className="text-xs" style={{ color: '#a78bfa' }}>↩</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold" style={{ color: '#a78bfa' }}>
                Replying to @{(replyingTo.profile as any)?.username}
              </p>
              <p className="text-[11px] text-white/40 truncate">
                {replyingTo.content ?? '📷 Photo'}
              </p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-white/30 text-xs shrink-0">✕</button>
          </div>
        )}

        {/* Photo preview */}
        {photoPreview && (
          <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <img src={photoPreview} alt="preview" className="w-9 h-9 rounded-lg object-cover shrink-0" />
            <p className="text-xs text-white/50 flex-1 truncate">{photo?.name}</p>
            <button onClick={removePhoto} className="text-white/30 text-xs shrink-0">✕</button>
          </div>
        )}

        {/* Text input */}
        <div className="flex items-center gap-2.5 px-4 pt-3">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <span style={{ fontSize: 16 }}>📷</span>
          </button>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 rounded-2xl px-4 py-2.5 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.09)' }}
            placeholder={replyingTo ? `Reply to @${(replyingTo.profile as any)?.username}...` : 'Say something...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          />
          <button
            onClick={sendMessage}
            disabled={(!text.trim() && !photo) || sending}
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: (!text.trim() && !photo) || sending ? 'rgba(34,197,94,0.25)' : '#22c55e' }}
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <span className="text-white font-black text-sm">↑</span>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
