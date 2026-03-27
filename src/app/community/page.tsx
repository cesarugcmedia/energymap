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
          supabase.from('profiles').select('username').eq('id', msg.user_id).single(),
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
        .select('*, profile:profiles(username), reply:messages!reply_to_id(id, content, photo_url, profile:profiles(username))')
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
        return [...prev, { ...newMsg, profile: { username: profile?.username } }]
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

  // Group consecutive messages from same sender
  const grouped = messages.map((msg, i) => {
    const prev = messages[i - 1]
    const isFirst = !prev || prev.user_id !== msg.user_id
    return { ...msg, isFirst }
  })

  return (
    <div className="bg-[#0a0a0f] flex flex-col" style={{ height: '100dvh' }}>

      {/* Header */}
      <div
        className="flex items-center justify-between px-5 shrink-0"
        style={{
          paddingTop: 'calc(56px + env(safe-area-inset-top))',
          paddingBottom: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: '#0a0a0f',
        }}
      >
        <p className="text-base font-black text-white">Community Chat</p>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#22c55e' }} />
          <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>Live</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3" style={{ paddingLeft: 12, paddingRight: 12 }}>
        {loading ? (
          <div className="flex justify-center mt-10">
            <div className="w-7 h-7 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 mt-20 text-center">
            <span style={{ fontSize: 44 }}>💬</span>
            <p className="text-base font-bold text-white">No messages yet</p>
            <p className="text-sm text-white/40">Be the first to say something!</p>
          </div>
        ) : (
          grouped.map((msg) => {
            const isMe = msg.user_id === user.id
            const username = isMe
              ? (profile?.username ?? msg.profile?.username)
              : msg.profile?.username
            const reply = msg.reply as any
            const rx = reactions[msg.id] ?? { likes: 0, dislikes: 0, mine: null }
            const hasReactions = rx.likes > 0 || rx.dislikes > 0

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                style={{ marginBottom: msg.isFirst ? 12 : 4, paddingLeft: isMe ? 48 : 0, paddingRight: isMe ? 0 : 48 }}
              >
                <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}>

                  {/* Username — only on first in a group, and only for others */}
                  {msg.isFirst && !isMe && (
                    <p className="text-xs font-semibold mb-1 px-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {username}
                    </p>
                  )}

                  {/* Bubble */}
                  <div
                    style={{
                      backgroundColor: isMe ? '#22c55e' : '#1e1e2e',
                      borderRadius: isMe
                        ? (msg.isFirst ? '20px 20px 4px 20px' : '20px 4px 4px 20px')
                        : (msg.isFirst ? '20px 20px 20px 4px' : '4px 20px 20px 4px'),
                      overflow: 'hidden',
                      maxWidth: '100%',
                    }}
                  >
                    {/* Reply quote */}
                    {reply && (
                      <div
                        className="px-3 pt-2 pb-1.5 mx-1 mt-1 rounded-xl"
                        style={{ backgroundColor: isMe ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.07)' }}
                      >
                        <p className="text-[10px] font-bold mb-0.5" style={{ color: isMe ? 'rgba(255,255,255,0.7)' : '#a78bfa' }}>
                          ↩ {(reply.profile as any)?.username}
                        </p>
                        {reply.content && (
                          <p className="text-xs truncate" style={{ color: isMe ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.45)' }}>{reply.content}</p>
                        )}
                        {!reply.content && reply.photo_url && (
                          <p className="text-xs italic" style={{ color: isMe ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)' }}>📷 Photo</p>
                        )}
                      </div>
                    )}

                    {/* Photo */}
                    {msg.photo_url && (
                      <img
                        src={msg.photo_url}
                        alt="shared"
                        style={{ maxWidth: 240, maxHeight: 180, display: 'block', width: '100%', objectFit: 'cover' }}
                      />
                    )}

                    {/* Text */}
                    {msg.content && (
                      <p
                        className="text-sm px-3.5 py-2.5"
                        style={{ color: isMe ? '#fff' : 'rgba(255,255,255,0.9)', lineHeight: 1.5, margin: 0 }}
                      >
                        {msg.content}
                      </p>
                    )}
                  </div>

                  {/* Time + reactions + actions */}
                  <div className={`flex items-center gap-2 mt-1 px-1 flex-wrap ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>{timeAgo(msg.created_at)}</span>

                    {/* Like */}
                    <button
                      onClick={() => toggleReaction(msg.id, 'like')}
                      className="flex items-center gap-0.5"
                    >
                      <span style={{ fontSize: 13, opacity: rx.mine === 'like' ? 1 : 0.4 }}>👍</span>
                      {rx.likes > 0 && <span className="text-[11px] font-bold" style={{ color: rx.mine === 'like' ? '#22c55e' : 'rgba(255,255,255,0.35)' }}>{rx.likes}</span>}
                    </button>

                    {/* Dislike */}
                    <button
                      onClick={() => toggleReaction(msg.id, 'dislike')}
                      className="flex items-center gap-0.5"
                    >
                      <span style={{ fontSize: 13, opacity: rx.mine === 'dislike' ? 1 : 0.4 }}>👎</span>
                      {rx.dislikes > 0 && <span className="text-[11px] font-bold" style={{ color: rx.mine === 'dislike' ? '#ef4444' : 'rgba(255,255,255,0.35)' }}>{rx.dislikes}</span>}
                    </button>

                    {/* Reply */}
                    <button onClick={() => startReply(msg)}>
                      <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>↩</span>
                    </button>

                    {/* Delete */}
                    {isMe && (
                      <button onClick={() => deleteMessage(msg.id)}>
                        <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.18)' }}>✕</span>
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
          borderTop: '1px solid rgba(255,255,255,0.06)',
          backgroundColor: '#0a0a0f',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 76px)',
        }}
      >
        {/* Reply preview */}
        {replyingTo && (
          <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
            <div className="w-0.5 h-8 rounded-full shrink-0" style={{ backgroundColor: '#a78bfa' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold" style={{ color: '#a78bfa' }}>{(replyingTo.profile as any)?.username ?? profile?.username}</p>
              <p className="text-[11px] text-white/40 truncate">{replyingTo.content ?? '📷 Photo'}</p>
            </div>
            <button onClick={() => setReplyingTo(null)} className="text-white/25 text-sm shrink-0">✕</button>
          </div>
        )}

        {/* Photo preview */}
        {photoPreview && (
          <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <img src={photoPreview} alt="preview" className="w-9 h-9 rounded-lg object-cover shrink-0" />
            <p className="text-xs text-white/40 flex-1 truncate">{photo?.name}</p>
            <button onClick={removePhoto} className="text-white/25 text-xs shrink-0">✕</button>
          </div>
        )}

        {/* Input row */}
        <div className="flex items-center gap-2 px-3 pt-2.5">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <span style={{ fontSize: 16 }}>📷</span>
          </button>
          <input
            ref={inputRef}
            type="text"
            className="flex-1 rounded-full px-4 py-2.5 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.08)' }}
            placeholder={replyingTo ? `Reply...` : 'iMessage'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          />
          <button
            onClick={sendMessage}
            disabled={(!text.trim() && !photo) || sending}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            style={{ backgroundColor: (!text.trim() && !photo) || sending ? 'rgba(34,197,94,0.3)' : '#22c55e' }}
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <span className="text-white font-black" style={{ fontSize: 16 }}>↑</span>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
