'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { isMissingSchema } from '@/lib/community'
import ui from '@/components/ui/ui.module.css'
import { DrinkIcon, CloseIcon, SearchIcon } from '@/components/Icons'

// Account → Profile: an optional bio line and a favorite drink, both shown on
// the public profile (/u/[username]). Columns come from
// scripts/profile-extras.sql; before it runs the editor still renders but
// saving explains that the feature isn't switched on yet.

type DrinkLite = { id: string; brand: string; name: string; flavor: string | null }
const label = (d: DrinkLite) => `${d.brand} ${d.flavor ?? d.name}`
const MAX_BIO = 160

export default function ProfileExtras({ userId, username }: { userId: string; username: string }) {
  const [bio, setBio] = useState('')
  const [fav, setFav] = useState<DrinkLite | null>(null)
  const [initial, setInitial] = useState<{ bio: string; favId: string | null }>({ bio: '', favId: null })
  const [loaded, setLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DrinkLite[]>([])
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase.from('profiles').select('bio, favorite_drink_id').eq('id', userId).maybeSingle()
      if (!error && data) {
        setBio(data.bio ?? '')
        setInitial({ bio: data.bio ?? '', favId: data.favorite_drink_id ?? null })
        if (data.favorite_drink_id) {
          const { data: d } = await supabase.from('drinks').select('id, brand, name, flavor').eq('id', data.favorite_drink_id).maybeSingle()
          if (d) setFav(d)
        }
      }
      setLoaded(true)
    })()
  }, [userId])

  // Debounced catalog search for the favorite drink.
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) { setResults([]); return }
    const t = setTimeout(async () => {
      const like = `%${q.replace(/[%_]/g, '')}%`
      const { data } = await supabase.from('drinks').select('id, brand, name, flavor').or(`brand.ilike.${like},name.ilike.${like},flavor.ilike.${like}`).limit(6)
      setResults(data ?? [])
    }, 300)
    return () => clearTimeout(t)
  }, [query])

  const dirty = bio.trim() !== initial.bio.trim() || (fav?.id ?? null) !== initial.favId

  async function save() {
    setSaving(true)
    setStatus(null)
    const { error } = await supabase.from('profiles').update({ bio: bio.trim() || null, favorite_drink_id: fav?.id ?? null }).eq('id', userId)
    setSaving(false)
    if (error) {
      setStatus(isMissingSchema(error) ? 'Bios aren’t switched on yet. Check back soon.' : 'Couldn’t save. Try again.')
      return
    }
    setInitial({ bio: bio.trim(), favId: fav?.id ?? null })
    setStatus('Saved')
    setTimeout(() => setStatus(null), 2000)
  }

  if (!loaded) return null

  return (
    <div style={{ padding: '0 16px', marginBottom: 22 }}>
      <p className={ui.sectionLabel} style={{ margin: '0 4px 8px' }}>About you</p>
      <div className={ui.card} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <textarea
            className={ui.input}
            rows={2}
            placeholder="A line about you, e.g. “Celsius loyalist. Hunting the rare Ghost flavors.”"
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
            style={{ resize: 'none' }}
          />
          <p style={{ fontSize: 12, color: 'var(--text-dim)', textAlign: 'right', marginTop: 4 }}>{bio.length}/{MAX_BIO}</p>
        </div>

        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>Favorite drink</p>
          {fav ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(201,244,0,0.08)', border: '1px solid rgba(201,244,0,0.3)' }}>
              <DrinkIcon size={16} color="var(--accent-text)" />
              <span style={{ flex: 1, fontSize: 15, color: 'var(--text)' }}>{label(fav)}</span>
              <button onClick={() => setFav(null)} aria-label="Remove favorite drink" style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <CloseIcon size={12} color="var(--text-dim)" />
              </button>
            </div>
          ) : (
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: 14, display: 'flex', pointerEvents: 'none' }}><SearchIcon size={16} color="var(--text-dim)" /></span>
              <input className={`${ui.input} ${ui.inputWithIcon}`} placeholder="Search drinks" value={query} onChange={(e) => setQuery(e.target.value)} />
              {results.length > 0 && (
                <div className="anim-rise" style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {results.map((d) => (
                    <button key={d.id} onClick={() => { setFav(d); setQuery(''); setResults([]) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <DrinkIcon size={15} color="var(--text-muted)" />
                      <span style={{ fontSize: 15, color: 'var(--text)' }}>{label(d)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className={ui.btnPrimary} disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</button>
          {status && <span className="anim-fade" style={{ fontSize: 14, color: status === 'Saved' ? 'var(--accent-text)' : 'var(--text-muted)' }}>{status}</span>}
          <Link href={`/u/${username}`} className={ui.linkQuiet} style={{ marginLeft: 'auto' }}>View public profile</Link>
        </div>
      </div>
    </div>
  )
}
