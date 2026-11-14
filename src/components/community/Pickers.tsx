'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { CloseIcon, PinIcon, DrinkIcon } from '@/components/Icons'
import ui from '@/components/ui/ui.module.css'

type StoreLite = { id: string; name: string; address: string | null }
type DrinkLite = { id: string; brand: string; flavor: string }

const dropdown: React.CSSProperties = { position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20, background: 'var(--surface)', border: '1px solid var(--fg-10)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.45)' }
const rowBtn: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--fg-06)', cursor: 'pointer', fontFamily: 'inherit' }

function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t) }, [value, ms])
  return v
}

export function Chip({ icon, label, onClear }: { icon: React.ReactNode; label: string; onClear?: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, background: 'var(--fg-06)', fontSize: 14, color: 'var(--text)', maxWidth: '100%' }}>
      {icon}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {onClear && <button onClick={onClear} aria-label="Remove" style={{ background: 'none', border: 'none', display: 'flex', cursor: 'pointer', padding: 0 }}><CloseIcon size={10} color="var(--text-dim)" /></button>}
    </span>
  )
}

export function StorePicker({ value, onChange, placeholder = 'Tag a store' }: { value: StoreLite | null; onChange: (s: StoreLite | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<StoreLite[]>([])
  const dq = useDebounced(q.trim())
  useEffect(() => {
    if (dq.length < 2) { setResults([]); return }
    let cancelled = false
    supabase.from('stores').select('id, name, address').eq('status', 'approved').ilike('name', `%${dq}%`).limit(5)
      .then(({ data }) => { if (!cancelled) setResults(data ?? []) })
    return () => { cancelled = true }
  }, [dq])

  if (value) return <Chip icon={<PinIcon size={12} color="var(--accent)" />} label={value.name} onClear={() => onChange(null)} />
  return (
    <div style={{ position: 'relative' }}>
      <input className={ui.input} style={{ fontSize: 15, padding: '10px 12px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {results.length > 0 && (
        <div style={dropdown}>
          {results.map((s) => (
            <button key={s.id} style={rowBtn} onClick={() => { onChange(s); setQ(''); setResults([]) }}>
              <div style={{ fontSize: 15, color: 'var(--text)' }}>{s.name}</div>
              {s.address && <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 1 }}>{s.address}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function DrinkPicker({ value, onChange, placeholder = 'Which drink?' }: { value: DrinkLite | null; onChange: (d: DrinkLite | null) => void; placeholder?: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<DrinkLite[]>([])
  const dq = useDebounced(q.trim())
  useEffect(() => {
    if (dq.length < 2) { setResults([]); return }
    let cancelled = false
    const like = `%${dq}%`
    supabase.from('drinks').select('id, brand, name, flavor').or(`brand.ilike.${like},name.ilike.${like},flavor.ilike.${like}`).limit(6)
      .then(({ data }) => { if (!cancelled) setResults((data ?? []).map((d: any) => ({ id: d.id, brand: d.brand, flavor: d.flavor || d.name }))) })
    return () => { cancelled = true }
  }, [dq])

  if (value) return <Chip icon={<DrinkIcon size={12} color="var(--accent)" />} label={`${value.brand} ${value.flavor}`} onClear={() => onChange(null)} />
  return (
    <div style={{ position: 'relative' }}>
      <input className={ui.input} style={{ fontSize: 15, padding: '10px 12px' }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {results.length > 0 && (
        <div style={dropdown}>
          {results.map((d) => (
            <button key={d.id} style={rowBtn} onClick={() => { onChange(d); setQ(''); setResults([]) }}>
              <div style={{ fontSize: 15, color: 'var(--text)' }}>{d.brand} {d.flavor}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
