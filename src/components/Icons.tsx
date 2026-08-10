// Shared line-icon set for UI chrome across the app — same stroke weight,
// rounded caps/joins, and 24x24 viewBox as the tab bar (NavIcons.tsx) and
// notification-card icons (NotificationIcons.tsx). Replaces standalone
// emoji used as functional icons (search, heart, flag, chevrons, checkmark,
// pin, store-type markers) which rendered with mismatched weights across
// devices. Decorative/thematic emoji (badge icons, celebratory copy) are
// deliberately left alone — those aren't "icons," they're a different,
// intentionally colorful visual language.

import type { JSX } from 'react'

export interface IconProps {
  size?: number
  color?: string
  strokeWidth?: number
}

const DEFAULT_COLOR = '#8b9284'

export function HeartIcon({ size = 20, color = DEFAULT_COLOR, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 20s-7-4.5-9.5-9C1 7.5 2.5 4 6 4c2 0 3.5 1.2 4.5 2.8C11.5 5.2 13 4 15 4c3.5 0 5 3.5 3.5 7-2.5 4.5-9.5 9-9.5 9z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
    </svg>
  )
}

export function FlagIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3v18" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M6 4h11l-2.5 4L17 12H6" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

export function SearchIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <circle cx="11" cy="11" r="7" stroke={color} strokeWidth={1.6} />
      <path d="M20 20l-4.5-4.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function CheckIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12l4 4L19 6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ClockIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="10" r="7" stroke={color} strokeWidth={1.6} />
      <path d="M12 5v5l3 2" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function PinIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" stroke={color} strokeWidth={1.6} />
      <circle cx="12" cy="10" r="3" stroke={color} strokeWidth={1.6} />
    </svg>
  )
}

export function CloseIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}

export function InfoIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="8" stroke={color} strokeWidth={1.6} />
      <path d="M12 8v5M12 16h.01" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 9l6 6 6-6" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronLeftIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M15 5l-7 7 7 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ChevronRightIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M9 5l7 7-7 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DirectionsIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M5 12h14M12 5l7 7-7 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Store-type icons — same 4 types used across map markers, filter chips,
// the add-store form, and every admin store list.
export function GroceryIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M4 21V9l8-5 8 5v12" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M9 21v-6h6v6" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

export function ConvenienceIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M4 21h16M6 21V10l6-5 6 5v11" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <rect x="10" y="13" width="4" height="4" stroke={color} strokeWidth={1.4} />
    </svg>
  )
}

export function GasIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M4 21h12" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M14 10h2.5a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 0 3 0v-6l-2-3" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

export function BellIcon({ size = 20, color = DEFAULT_COLOR, filled = false }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 3C9.5 3 7.8 4.9 7.8 7.3v3.4c0 .8-.3 1.6-.9 2.2L6 14v1h12v-1l-.9-1.1c-.6-.6-.9-1.4-.9-2.2V7.3C16.2 4.9 14.5 3 12 3z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
      <path d="M10 17.5a2 2 0 0 0 4 0" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function DrinkIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3h12l-1.2 15.5a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8L6 3z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M4 3h16" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function LightningIcon({ size = 20, color = DEFAULT_COLOR, filled = true }: IconProps & { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" stroke={filled ? 'none' : color} strokeWidth={1.6} strokeLinejoin="round" fill={filled ? color : 'none'} />
    </svg>
  )
}

export function UserIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth={1.6} />
      <path d="M4 20c0-3.9 3.6-7 8-7s8 3.1 8 7" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function ClipboardIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <rect x="6" y="4" width="12" height="17" rx="2" stroke={color} strokeWidth={1.6} />
      <path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M9 11h6M9 15h6" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}

export function CommentIcon({ size = 20, color = DEFAULT_COLOR }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size} xmlns="http://www.w3.org/2000/svg">
      <path d="M4 5h16v10H9l-4 4V5z" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  )
}

export const OtherIcon = PinIcon

const STORE_TYPE_ICON: Record<string, (p: IconProps) => JSX.Element> = {
  gas_station: GasIcon,
  convenience: ConvenienceIcon,
  grocery: GroceryIcon,
  other: OtherIcon,
}

export function StoreTypeIcon({ type, size = 20, color = DEFAULT_COLOR }: IconProps & { type?: string | null }) {
  const Icon = (type && STORE_TYPE_ICON[type]) || OtherIcon
  return <Icon size={size} color={color} />
}

// Raw SVG-markup versions of the same store-type icons, for MapView.tsx
// which builds Mapbox markers via innerHTML strings rather than JSX.
const STORE_TYPE_PATH: Record<string, (color: string) => string> = {
  gas_station: (c) =>
    `<path d="M6 21V5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v16" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 21h12" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/><path d="M14 10h2.5a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 0 3 0v-6l-2-3" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
  convenience: (c) =>
    `<path d="M4 21h16M6 21V10l6-5 6 5v11" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><rect x="10" y="13" width="4" height="4" stroke="${c}" stroke-width="1.4"/>`,
  grocery: (c) =>
    `<path d="M4 21V9l8-5 8 5v12" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 21v-6h6v6" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
  other: (c) =>
    `<path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" stroke="${c}" stroke-width="1.6"/><circle cx="12" cy="10" r="3" stroke="${c}" stroke-width="1.6"/>`,
}

export function storeTypeIconSvg(type: string | null | undefined, color: string, size: number) {
  const inner = (type && STORE_TYPE_PATH[type]) || STORE_TYPE_PATH.other
  return `<svg viewBox="0 0 24 24" fill="none" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">${inner(color)}</svg>`
}
