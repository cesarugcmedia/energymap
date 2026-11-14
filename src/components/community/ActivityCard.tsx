'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LightningIcon, GroceryIcon, BellIcon, ChevronRightIcon } from '@/components/Icons'
import { QUANTITY_STYLE, timeAgo, type ActivityItem } from './types'

// Compact, auto-generated feed cards (reports, new stores, restocks of
// followed flavors). Lighter than posts so real posts still stand out.
export default function ActivityCard({ item }: { item: ActivityItem }) {
  const router = useRouter()
  const goStore = () => router.push(`/store/${item.store.id}?name=${encodeURIComponent(item.store.name)}`)

  const icon =
    item.kind === 'report' ? <LightningIcon size={15} color="var(--accent-text)" /> :
    item.kind === 'store' ? <GroceryIcon size={15} color="#60a5fa" /> :
    <BellIcon size={15} color="var(--accent-text)" filled />

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={goStore}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goStore() } }}
      className="reveal"
      style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 12px', borderRadius: 14, background: 'var(--fg-03)', border: '1px solid var(--fg-06)', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}
    >
      <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--fg-06)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 14, lineHeight: 1.45, color: 'var(--text-muted)' }}>
        {item.kind === 'report' && (
          <>
            <Link href={`/u/${item.username}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>@{item.username}</Link>
            {' reported '}
            {item.drinks.length === 1 ? (
              <>
                <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.drinks[0].brand} {item.drinks[0].flavor}</strong>{' '}
                <span style={{ color: QUANTITY_STYLE[item.drinks[0].quantity]?.color, fontWeight: 600 }}>{QUANTITY_STYLE[item.drinks[0].quantity]?.label}</span>
              </>
            ) : (
              <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.drinks.length} flavors</strong>
            )}
            {' at '}<strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.store.name}</strong>
            {item.drinks.length > 1 && (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {item.drinks.slice(0, 4).map((d, i) => (
                  <span key={i} style={{ fontSize: 12, padding: '2px 7px', borderRadius: 6, background: 'var(--fg-06)', color: 'var(--text)' }}>
                    {d.brand} {d.flavor} <em style={{ fontStyle: 'normal', fontWeight: 700, color: QUANTITY_STYLE[d.quantity]?.color }}>{QUANTITY_STYLE[d.quantity]?.label}</em>
                  </span>
                ))}
                {item.drinks.length > 4 && <span style={{ fontSize: 12, color: 'var(--text-dim)', alignSelf: 'center' }}>+{item.drinks.length - 4} more</span>}
              </span>
            )}
          </>
        )}
        {item.kind === 'store' && (
          <>
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>New store: {item.store.name}</strong>
            {item.username ? <> added by <Link href={`/u/${item.username}`} onClick={(e) => e.stopPropagation()} style={{ color: 'var(--text)', textDecoration: 'none' }}>@{item.username}</Link></> : null}
            {item.store.address && <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)' }}>{item.store.address}</span>}
          </>
        )}
        {item.kind === 'restock' && (
          <>
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.drink.brand} {item.drink.flavor}</strong>
            {' is back in stock at '}<strong style={{ color: 'var(--text)', fontWeight: 600 }}>{item.store.name}</strong>
            <span style={{ display: 'block', fontSize: 13, color: 'var(--text-dim)' }}>A flavor you follow</span>
          </>
        )}
        <span style={{ display: 'block', fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>{timeAgo(item.created_at)}</span>
      </span>
      <ChevronRightIcon size={14} color="var(--text-dim)" />
    </div>
  )
}
