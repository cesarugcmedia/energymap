'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ui from '@/components/ui/ui.module.css'
import { ChevronDownIcon } from '@/components/Icons'
import ConfettiShower from '@/components/ui/ConfettiShower'
import Burst from '@/components/ui/Burst'

type Drink = { id: string; brand: string; name: string; flavor: string | null }

// Cached for the session: the catalog changes rarely and every profile uses it.
let catalogCache: Drink[] | null = null
async function loadCatalog(): Promise<Drink[]> {
  if (catalogCache) return catalogCache
  const all: Drink[] = []
  const BATCH = 1000
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await supabase.from('drinks').select('id, brand, name, flavor').order('brand').range(from, from + BATCH - 1)
    if (error) break
    all.push(...(data ?? []))
    if (!data || data.length < BATCH) break
  }
  catalogCache = all
  return all
}

// Profile → Collection: every flavor in the catalog, grouped by brand, with
// the ones this person has found lit up ("47 of 212 flavors").
export default function FlavorCollection({ found, isMe }: { found: string[]; isMe: boolean }) {
  const [catalog, setCatalog] = useState<Drink[] | null>(catalogCache)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [onlyFound, setOnlyFound] = useState(false)
  const [celebrate, setCelebrate] = useState(0)
  const [newlyDone, setNewlyDone] = useState<Set<string>>(new Set())
  const foundSet = useMemo(() => new Set(found), [found])

  useEffect(() => { if (!catalog) loadCatalog().then(setCatalog) }, [catalog])

  const brands = useMemo(() => {
    if (!catalog) return []
    const map = new Map<string, Drink[]>()
    for (const d of catalog) {
      const list = map.get(d.brand) ?? []
      list.push(d)
      map.set(d.brand, list)
    }
    return [...map.entries()]
      .map(([brand, drinks]) => ({ brand, drinks, got: drinks.filter((d) => foundSet.has(d.id)).length }))
      // Brands with finds first (most complete first), then the rest A–Z.
      .sort((a, b) => (b.got > 0 ? 1 : 0) - (a.got > 0 ? 1 : 0) || b.got / b.drinks.length - a.got / a.drinks.length || a.brand.localeCompare(b.brand))
  }, [catalog, foundSet])

  // Your own brands at 100%: confetti the first time this device sees each one.
  useEffect(() => {
    if (!isMe || !brands.length) return
    const done = brands.filter((b) => b.got > 0 && b.got === b.drinks.length).map((b) => b.brand)
    if (!done.length) return
    const KEY = 'ampedmap_complete_brands_v1'
    try {
      const seen: string[] = JSON.parse(localStorage.getItem(KEY) ?? '[]')
      const fresh = done.filter((b) => !seen.includes(b))
      if (fresh.length) {
        setNewlyDone(new Set(fresh))
        setCelebrate(Date.now())
        localStorage.setItem(KEY, JSON.stringify([...new Set([...seen, ...fresh])]))
      }
    } catch { /* ignore */ }
  }, [isMe, brands])

  if (!catalog) return <p style={{ fontSize: 15, color: 'var(--text-muted)' }}>Loading the catalog…</p>

  const total = catalog.length
  const got = catalog.filter((d) => foundSet.has(d.id)).length
  const pct = total ? Math.round((got / total) * 100) : 0
  const shown = onlyFound ? brands.filter((b) => b.got > 0) : brands
  const toggle = (b: string) => setOpen((s) => { const n = new Set(s); n.has(b) ? n.delete(b) : n.add(b); return n })

  return (
    <div>
      <ConfettiShower trigger={celebrate} />
      <div className={`${ui.card} reveal`} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>{got}</span>
          <span style={{ fontSize: 15, color: 'var(--text-muted)' }}>of {total} flavors found</span>
          <span style={{ marginLeft: 'auto', fontSize: 15, fontWeight: 600, color: 'var(--accent-text)' }}>{pct}%</span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: 'var(--fg-08)', marginTop: 10, overflow: 'hidden' }}>
          <div className="anim-fill" style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: '#C9F400' }} />
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 8 }}>
          {got === 0
            ? isMe ? 'Report a flavor in stock to add it to your collection.' : 'No flavors found yet.'
            : 'A flavor counts once it’s reported in stock.'}
        </p>
      </div>

      {got > 0 && (
        <div className={ui.chipRow} style={{ marginBottom: 12 }}>
          <button className={`${ui.chip} ${!onlyFound ? ui.chipActive : ''}`} onClick={() => setOnlyFound(false)}>All brands</button>
          <button className={`${ui.chip} ${onlyFound ? ui.chipActive : ''}`} onClick={() => setOnlyFound(true)}>Found only</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map(({ brand, drinks, got: g }, bi) => {
          const isOpen = open.has(brand)
          const complete = g > 0 && g === drinks.length
          const list = onlyFound ? drinks.filter((d) => foundSet.has(d.id)) : drinks
          let lit = 0
          return (
            <div key={brand} className={`${ui.card} anim-rise${complete ? ' shine' : ''}`} style={{ padding: 0, overflow: 'hidden', animationDelay: `${Math.min(bi, 10) * 40}ms`, ['--shine-delay' as string]: `${0.5 + Math.min(bi, 10) * 0.04}s`, borderColor: complete ? 'rgba(201,244,0,0.45)' : undefined }}>
              <button onClick={() => toggle(brand)} aria-expanded={isOpen} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                    {brand}
                    {complete && (
                      <span className={newlyDone.has(brand) ? 'anim-pop' : undefined} style={{ position: 'relative', fontSize: 11, fontWeight: 700, color: '#0D1210', background: '#C9F400', borderRadius: 6, padding: '2px 7px', animationDelay: '0.6s' }}>
                        <Burst trigger={newlyDone.has(brand) ? celebrate : 0} />Complete
                      </span>
                    )}
                  </span>
                  <span style={{ display: 'block', height: 4, borderRadius: 99, background: 'var(--fg-08)', marginTop: 7, overflow: 'hidden' }}>
                    <span className="anim-fill" style={{ display: 'block', width: `${(g / drinks.length) * 100}%`, height: '100%', background: '#C9F400', animationDelay: `${150 + Math.min(bi, 10) * 40}ms` }} />
                  </span>
                </span>
                <span style={{ fontSize: 13, color: g ? 'var(--accent-text)' : 'var(--text-dim)', fontWeight: 600, flexShrink: 0 }}>{g}/{drinks.length}</span>
                <span style={{ display: 'flex', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}><ChevronDownIcon size={16} color="var(--text-dim)" /></span>
              </button>
              {isOpen && (
                <div className="anim-fade" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 14px 14px' }}>
                  {list.map((d) => {
                    const has = foundSet.has(d.id)
                    const order = has ? lit++ : 0
                    return (
                      <span key={d.id} className={has ? 'chip-light' : undefined} style={{ animationDelay: has ? `${Math.min(order, 16) * 45}ms` : undefined, fontSize: 13, fontWeight: has ? 600 : 500, padding: '5px 10px', borderRadius: 999, color: has ? 'var(--accent-text)' : 'var(--text-dim)', background: has ? 'rgba(201,244,0,0.12)' : 'var(--fg-04)', border: `1px ${has ? 'solid' : 'dashed'} ${has ? 'rgba(201,244,0,0.35)' : 'var(--fg-13)'}` }}>
                        {d.flavor || d.name}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
