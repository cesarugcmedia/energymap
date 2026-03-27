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
  const msgRefs = useRef<Record<string, HTMLElement | null>>({})

  const [messages, setMessages] = useState<any[]>([])
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
        const { data: p } = await supabase.from('profiles').select('username').eq('id', msg.user_id).single()
        setMessages((prev) => {
          if (prev.find((m) => m.id === msg.id)) return prev
          return [...prev, { ...msg, profile: p }]
        })
        // Only auto-scroll to bottom for top-level messages from others
        if (!msg.reply_to_id) {
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        setMessages((prev) => prev.filter((m) => m.id !== (payload.old as any).id))
      })
      .subscribe()

    return () => { supabase.removeChannel(msgChannel) }
  }, [user])

  useEffect(() => {
    if (!loading) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
      localStorage.setItem('community_last_read', new Date().toISOString())
    }
  }, [loading])

  async function fetchAll() {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, profile:profiles(username)')
      .order('created_at', { ascending: true })
      .limit(200)
    if (msgs) setMessages(msgs)
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

    // Flatten threading: if replying to a reply, attach to the top-level parent instead
    const replyParentId = replyingTo
      ? (replyingTo.reply_to_id ?? replyingTo.id)
      : null

    const { data: newMsg, error } = await supabase
      .from('messages')
      .insert({
        user_id: user.id,
        content: text.trim() || null,
        photo_url: photoUrl,
        reply_to_id: replyParentId,
      })
      .select('*')
      .single()

    if (newMsg && !error) {
      setMessages((prev) => {
        if (prev.find((m) => m.id === newMsg.id)) return prev
        return [...prev, { ...newMsg, profile: { username: profile?.username } }]
      })
      // Scroll to parent thread so user sees the reply land in place
      setTimeout(() => {
        if (replyParentId && msgRefs.current[replyParentId]) {
          msgRefs.current[replyParentId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
          bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
      }, 80)
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

  // Build reply map: parentId → list of replies (all replies are max 1 level deep)
  const replyMap: Record<string, any[]> = {}
  messages.forEach((m) => {
    if (m.reply_to_id) {
      if (!replyMap[m.reply_to_id]) replyMap[m.reply_to_id] = []
      replyMap[m.reply_to_id].push(m)
    }
  })
  const topLevel = messages.filter((m) => !m.reply_to_id)

  function renderMessage(msg: any, isReply = false) {
    const isMe = msg.user_id === user!.id
    const username = isMe ? (profile?.username ?? msg.profile?.username) : msg.profile?.username
    const threadReplies = !isReply ? (replyMap[msg.id] ?? []) : []

    return (
      <div
        key={msg.id}
        ref={(el) => { msgRefs.current[msg.id] = el }}
        style={{ marginBottom: isReply ? 4 : 14 }}
      >
        {/* Message row */}
        <div
          className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
          style={{
            paddingLeft: isReply ? (isMe ? 48 : 28) : (isMe ? 48 : 0),
            paddingRight: isReply ? (isMe ? 28 : 48) : (isMe ? 0 : 48),
          }}
        >
          {/* Left thread line for others' replies */}
          {isReply && !isMe && (
            <div style={{ width: 2, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.15)', marginRight: 8, alignSelf: 'stretch', flexShrink: 0 }} />
          )}

          <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-full`}>
            {/* Username */}
            <p
              className="font-semibold mb-1 px-1"
              style={{ color: isMe ? 'rgba(34,197,94,0.75)' : 'rgba(255,255,255,0.45)', fontSize: isReply ? 10 : 12 }}
            >
              {username}
            </p>

            {/* Bubble */}
            <div
              style={{
                backgroundColor: isMe ? '#22c55e' : (isReply ? '#16162a' : '#1e1e2e'),
                borderRadius: isMe ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                overflow: 'hidden',
                maxWidth: '100%',
              }}
            >
              {msg.photo_url && (
                <img
                  src={msg.photo_url}
                  alt="shared"
                  style={{ maxWidth: 240, maxHeight: 180, display: 'block', width: '100%', objectFit: 'cover' }}
                />
              )}
              {msg.content && (
                <p
                  className="px-3.5 py-2.5"
                  style={{ color: isMe ? '#fff' : 'rgba(255,255,255,0.9)', lineHeight: 1.5, margin: 0, fontSize: isReply ? 13 : 14 }}
                >
                  {msg.content}
                </p>
              )}
            </div>

            {/* Timestamp + reply + delete */}
            <div className={`flex items-center gap-2 mt-0.5 px-1 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.5)' }}>{timeAgo(msg.created_at)}</span>
              <button onClick={() => startReply(msg)} className="text-[10px] font-semibold" style={{ color: 'rgba(255,255,255,0.35)' }}>
                ↩ Reply
              </button>
              {isMe && (
                <button onClick={() => deleteMessage(msg.id)} className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Right thread line for my replies */}
          {isReply && isMe && (
            <div style={{ width: 2, borderRadius: 99, backgroundColor: 'rgba(34,197,94,0.35)', marginLeft: 8, alignSelf: 'stretch', flexShrink: 0 }} />
          )}
        </div>

        {/* Thread replies — rendered directly under their parent, indented */}
        {threadReplies.length > 0 && (
          <div style={{ marginTop: 4 }}>
            {threadReplies.map((r) => renderMessage(r, true))}
          </div>
        )}
      </div>
    )
  }

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
          <div>
            {topLevel.map((msg) => renderMessage(msg, false))}
          </div>
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
            <div className="w-0.5 h-8 rounded-full shrink-0" style={{ backgroundColor: '#22c55e' }} />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold" style={{ color: '#22c55e' }}>
                Replying to {(replyingTo.profile as any)?.username ?? profile?.username}
              </p>
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
            placeholder={replyingTo ? 'Write a reply…' : 'Message…'}
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
