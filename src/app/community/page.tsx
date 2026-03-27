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
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.3)' }}>🎯</span>
  )
  if (tier === 'hunter') return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>⚡</span>
  )
  return null
}

export default function CommunityPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [messages, setMessages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.replace('/account')
  }, [user, authLoading])

  useEffect(() => {
    if (!user) return
    fetchMessages()

    const channel = supabase
      .channel('community-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async (payload) => {
        const msg = payload.new as any
        // Fetch the sender profile
        const { data: p } = await supabase
          .from('profiles')
          .select('username, tier, is_verified_reporter')
          .eq('id', msg.user_id)
          .single()
        setMessages((prev) => [...prev, { ...msg, profile: p }])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  useEffect(() => {
    if (!loading) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
    }
  }, [loading])

  async function fetchMessages() {
    const { data } = await supabase
      .from('messages')
      .select('*, profile:profiles(username, tier, is_verified_reporter)')
      .order('created_at', { ascending: true })
      .limit(100)
    if (data) setMessages(data)
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

    await supabase.from('messages').insert({
      user_id: user.id,
      content: text.trim() || null,
      photo_url: photoUrl,
    })

    setText('')
    removePhoto()
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

  return (
    <div className="bg-[#0a0a0f] flex flex-col" style={{ height: '100dvh' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 pb-4 shrink-0"
        style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))', borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div>
          <p className="text-xl font-black text-white">💬 Community</p>
          <p className="text-xs text-white/40 mt-0.5">Chat with fellow hunters</p>
        </div>
        <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#22c55e' }} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ paddingBottom: 8 }}>
        {loading ? (
          <div className="flex justify-center mt-10">
            <div className="w-7 h-7 border-2 border-[#22c55e] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center gap-3 mt-16 text-center">
            <span style={{ fontSize: 48 }}>💬</span>
            <p className="text-lg font-bold text-white">No messages yet</p>
            <p className="text-sm text-white/40">Be the first to say something!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.user_id === user.id
            const p = msg.profile as any
            return (
              <div key={msg.id} className={`flex gap-2.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                {/* Avatar */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1"
                  style={{ backgroundColor: isMe ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)' }}
                >
                  <span className="text-xs font-black" style={{ color: isMe ? '#22c55e' : 'rgba(255,255,255,0.6)' }}>
                    {p?.username?.[0]?.toUpperCase() ?? '?'}
                  </span>
                </div>

                <div className={`flex flex-col gap-1 max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {/* Name + badges */}
                  <div className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                    <span className="text-xs font-bold" style={{ color: isMe ? '#22c55e' : 'rgba(255,255,255,0.7)' }}>
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
                    className="rounded-2xl overflow-hidden"
                    style={{
                      backgroundColor: isMe ? 'rgba(34,197,94,0.12)' : '#1a1a24',
                      border: `1px solid ${isMe ? 'rgba(34,197,94,0.25)' : 'rgba(255,255,255,0.07)'}`,
                      borderRadius: isMe ? '18px 4px 18px 18px' : '4px 18px 18px 18px',
                    }}
                  >
                    {msg.photo_url && (
                      <img
                        src={msg.photo_url}
                        alt="shared photo"
                        className="w-full max-w-[240px] object-cover"
                        style={{ maxHeight: 200, display: 'block' }}
                      />
                    )}
                    {msg.content && (
                      <p className="text-sm text-white px-3.5 py-2.5" style={{ lineHeight: 1.5 }}>{msg.content}</p>
                    )}
                  </div>

                  {/* Delete own messages */}
                  {isMe && (
                    <button onClick={() => deleteMessage(msg.id)} className="text-[10px] text-white/20 hover:text-red-400">
                      delete
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Photo preview */}
      {photoPreview && (
        <div className="px-4 pb-2 shrink-0">
          <div className="flex items-center gap-2 rounded-xl p-2" style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(139,92,246,0.3)' }}>
            <img src={photoPreview} alt="preview" className="w-10 h-10 rounded-lg object-cover" />
            <p className="text-xs text-white/60 flex-1 truncate">{photo?.name}</p>
            <button onClick={removePhoto} className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.15)' }}>
              <span className="text-[10px]" style={{ color: '#ef4444' }}>✕</span>
            </button>
          </div>
        </div>
      )}

      {/* Input bar */}
      <div
        className="shrink-0 px-4 pt-3"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.07)',
          backgroundColor: '#0a0a0f',
          paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)',
        }}
      >
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)' }}
          >
            <span style={{ fontSize: 18 }}>📷</span>
          </button>
          <input
            type="text"
            className="flex-1 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
            style={{ backgroundColor: '#1a1a24', border: '1px solid rgba(255,255,255,0.07)' }}
            placeholder="Say something..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          />
          <button
            onClick={sendMessage}
            disabled={(!text.trim() && !photo) || sending}
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ backgroundColor: (!text.trim() && !photo) || sending ? 'rgba(34,197,94,0.3)' : '#22c55e' }}
          >
            {sending
              ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : <span className="text-white font-bold text-sm">↑</span>
            }
          </button>
        </div>
      </div>
    </div>
  )
}
