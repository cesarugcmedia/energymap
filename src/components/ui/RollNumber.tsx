'use client'

import { useEffect, useRef, useState } from 'react'

// A number that rolls to its new value like an odometer: the old value slides
// out (up when it grows, down when it shrinks) as the new one slides in.
// Renders plainly on first paint; styles live in globals.css (.roll-*).
export default function RollNumber({ value }: { value: number }) {
  const prev = useRef(value)
  const [roll, setRoll] = useState<{ from: number; dir: 'up' | 'down'; n: number } | null>(null)

  useEffect(() => {
    if (value === prev.current) return
    const from = prev.current
    prev.current = value
    setRoll((r) => ({ from, dir: value > from ? 'up' : 'down', n: (r?.n ?? 0) + 1 }))
  }, [value])

  return (
    <span className="roll">
      {roll && <span key={`o${roll.n}`} className={`roll-out-${roll.dir}`} aria-hidden="true">{roll.from}</span>}
      <span key={`i${roll?.n ?? 0}`} className={roll ? `roll-in-${roll.dir}` : undefined}>{value}</span>
    </span>
  )
}
