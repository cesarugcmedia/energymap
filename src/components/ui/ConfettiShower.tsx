'use client'

import { useEffect, useMemo, useState } from 'react'

const COLORS = ['#C9F400', '#FFB300', '#60a5fa', '#FF8A3D', '#ffffff']

// A one-off full-screen confetti shower (same pieces as the badge-unlock
// card). Re-key `trigger` to fire again; renders nothing while it's 0.
export default function ConfettiShower({ trigger }: { trigger: number }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (!trigger) return
    setShown(trigger)
    const t = setTimeout(() => setShown(0), 3200)
    return () => clearTimeout(t)
  }, [trigger])

  const pieces = useMemo(() => Array.from({ length: 44 }, (_, i) => ({
    left: `${(i * 37 + trigger * 11) % 100}%`,
    dx: `${((i * 53) % 120) - 60}px`,
    rot: `${360 + ((i * 97) % 540)}deg`,
    dur: `${1.8 + ((i * 13) % 12) / 10}s`,
    delay: `${((i * 7) % 10) / 20}s`,
    color: COLORS[i % COLORS.length],
    round: i % 3 === 0,
  })), [trigger])

  if (!shown) return null
  return (
    <div className="confetti" aria-hidden="true" style={{ position: 'fixed', zIndex: 80 }}>
      {pieces.map((c, i) => (
        <span key={`${shown}-${i}`} style={{ left: c.left, background: c.color, borderRadius: c.round ? '50%' : 2, ['--dx' as string]: c.dx, ['--rot' as string]: c.rot, ['--dur' as string]: c.dur, ['--delay' as string]: c.delay } as React.CSSProperties} />
      ))}
    </div>
  )
}
