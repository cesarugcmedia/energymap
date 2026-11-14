// Line icons for notification cards, matching the nav bar's line-icon
// language (src/components/NavIcons.tsx) instead of mixed system emoji.

import type { JSX } from 'react'

// Lime in dark mode, darker olive in light mode.
const LIME = 'var(--accent-text)'

export function DrinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3h12l-1.2 15.5a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 3z" stroke={LIME} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M4 3h16" stroke={LIME} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 21V9l8-5 8 5v12" stroke={LIME} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" stroke={LIME} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function ReportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill={LIME} />
    </svg>
  )
}

export function BadgeIconSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="9" r="5" stroke={LIME} strokeWidth="1.6" />
      <path d="M9 13.2 7 21l5-3 5 3-2-7.8" stroke={LIME} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function BellIconSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3C9.5 3 7.8 4.9 7.8 7.3v3.4c0 .8-.3 1.6-.9 2.2L6 14v1h12v-1l-.9-1.1c-.6-.6-.9-1.4-.9-2.2V7.3C16.2 4.9 14.5 3 12 3z" stroke={LIME} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 17.5a2 2 0 0 0 4 0" stroke={LIME} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function CommentIconSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 5h16v10H9l-4 4V5z" stroke={LIME} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function FollowIconSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="17" height="17" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="8" r="3.5" stroke={LIME} strokeWidth="1.6" />
      <path d="M3.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" stroke={LIME} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M19 8v6M16 11h6" stroke={LIME} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

const TYPE_ICON: Record<string, () => JSX.Element> = {
  stock_update: ReportIcon,
  store_approved: StoreIcon,
  store_rejected: StoreIcon,
  new_store: StoreIcon,
  new_drink: DrinkIcon,
  mention: CommentIconSvg,
  comment: CommentIconSvg,
  reply: CommentIconSvg,
  follow: FollowIconSvg,
  badge: BadgeIconSvg,
  drink_alert: BellIconSvg,
}

export function notificationIcon(type: string) {
  const Icon = TYPE_ICON[type] ?? BellIconSvg
  return <Icon />
}
