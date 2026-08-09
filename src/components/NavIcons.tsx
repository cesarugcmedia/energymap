// One consistent line-weight icon set for the nav bar, replacing mismatched
// system emoji (some bold/colorful like 👥🔔, some thin/monochrome like
// 🗺️). Active tab = solid lime fill, matching the lime-for-active pattern
// used everywhere else in the app (toggle buttons, active filter chips).
// Inactive = simple gray outline.

interface IconProps {
  active: boolean
}

const INACTIVE = '#8b9284'
const ACTIVE = '#C9F400'

export function MapIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      {active ? (
        <>
          <path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" fill={ACTIVE} />
          <circle cx="12" cy="10" r="3" fill="#0a0b0a" />
        </>
      ) : (
        <>
          <path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8z" stroke={INACTIVE} strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="10" r="3" stroke={INACTIVE} strokeWidth="1.6" />
        </>
      )}
    </svg>
  )
}

export function CommunityIcon({ active }: IconProps) {
  const c = active ? ACTIVE : INACTIVE
  return (
    <svg viewBox="0 0 24 24" fill="none" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8.5" cy="9" r="3" stroke={c} strokeWidth="1.6" fill={active ? c : 'none'} />
      <circle cx="16" cy="10.5" r="2.3" stroke={c} strokeWidth="1.6" fill={active ? c : 'none'} />
      <path d="M3 19c0-2.8 2.5-5 5.5-5s5.5 2.2 5.5 5" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.5 14.3c2.6.3 4.5 2.2 4.5 4.7" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function AlertsIcon({ active }: IconProps) {
  const c = active ? ACTIVE : INACTIVE
  return (
    <svg viewBox="0 0 24 24" fill="none" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 3C9.5 3 7.8 4.9 7.8 7.3v3.4c0 .8-.3 1.6-.9 2.2L6 14v1h12v-1l-.9-1.1c-.6-.6-.9-1.4-.9-2.2V7.3C16.2 4.9 14.5 3 12 3z"
        stroke={c} strokeWidth="1.6" strokeLinejoin="round" fill={active ? c : 'none'}
      />
      <path d="M10 17.5a2 2 0 0 0 4 0" stroke={c} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function AccountIcon({ active }: IconProps) {
  const c = active ? ACTIVE : INACTIVE
  return (
    <svg viewBox="0 0 24 24" fill="none" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="8" r="3.4" stroke={c} strokeWidth="1.6" fill={active ? c : 'none'} />
      <path d="M5 20c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5" stroke={c} strokeWidth="1.6" strokeLinecap="round" fill={active ? c : 'none'} fillOpacity={active ? 0.15 : 0} />
    </svg>
  )
}

export function AdminIcon({ active }: IconProps) {
  const c = active ? ACTIVE : INACTIVE
  return (
    <svg viewBox="0 0 24 24" fill="none" width="22" height="22" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="3" stroke={c} strokeWidth="1.6" fill={active ? c : 'none'} />
      <path
        d="M12 3v2.4M12 18.6V21M4.9 6.5l1.7 1.4M17.4 16.1l1.7 1.4M3 12h2.4M18.6 12H21M4.9 17.5l1.7-1.4M17.4 7.9l1.7-1.4M7.3 4.1l1 2.1M15.7 17.8l1 2.1M7.3 19.9l1-2.1M15.7 6.2l1-2.1"
        stroke={c} strokeWidth="1.6" strokeLinecap="round"
      />
    </svg>
  )
}
