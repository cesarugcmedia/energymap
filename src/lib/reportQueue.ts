'use client'

import { supabase } from '@/lib/supabase'
import type { Amount, Sighting } from '@/lib/sightings'

// Sightings logged with no signal (coolers are often at the back of the
// store) are saved on the device and sent automatically once the phone is
// back online — see ReportQueueSync, mounted app-wide in layout.tsx.
//
// The server still applies the usual geofence (using the GPS fix captured
// when the report was made), daily limit and dedup at send time. Reports
// older than MAX_AGE_MS are dropped instead of sent, since stock that old
// would mislead people.

export type QueuedReport = {
  id: string
  storeId: string
  storeName: string
  // New: sighting (+ optional amount). Items saved by older app versions
  // carry quantity instead; the server converts those.
  reports: { drink_id: string; sighting?: Sighting; amount?: Amount | null; quantity?: string }[]
  lat?: number
  lng?: number
  queuedAt: number
}

const KEY = 'pending_stock_reports_v1'
const MAX_AGE_MS = 6 * 60 * 60 * 1000
export const QUEUE_EVENT = 'report-queue-changed'

export function getQueue(): QueuedReport[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

function setQueue(q: QueuedReport[]) {
  try { localStorage.setItem(KEY, JSON.stringify(q)) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(QUEUE_EVENT))
}

export function addToQueue(item: Omit<QueuedReport, 'id' | 'queuedAt'>): QueuedReport {
  const full: QueuedReport = { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, queuedAt: Date.now() }
  setQueue([...getQueue(), full])
  return full
}

export function removeFromQueue(id: string): boolean {
  const q = getQueue()
  const next = q.filter((r) => r.id !== id)
  setQueue(next)
  return next.length !== q.length
}

// True when a fetch failed because there's no connection (vs. a real error
// response from the server).
export function isNetworkFailure(err: unknown) {
  return typeof navigator !== 'undefined' && (!navigator.onLine || err instanceof TypeError)
}

let flushing = false

// Sends everything queued. Returns how many reports went through and the
// errors for any the server refused (those are dropped — retrying won't
// change a geofence or daily-limit answer).
export async function flushQueue(): Promise<{ sent: number; failed: string[] }> {
  const result = { sent: 0, failed: [] as string[] }
  if (flushing || typeof navigator === 'undefined' || !navigator.onLine) return result
  const queue = getQueue()
  if (queue.length === 0) return result
  flushing = true
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return result
    for (const item of queue) {
      if (Date.now() - item.queuedAt > MAX_AGE_MS) {
        removeFromQueue(item.id)
        result.failed.push(`Your saved sightings for ${item.storeName} were too old to send.`)
        continue
      }
      let res: Response
      try {
        res = await fetch('/api/stock/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ store_id: item.storeId, reports: item.reports, lat: item.lat, lng: item.lng }),
        })
      } catch {
        break // still offline — try again later
      }
      const body = await res.json().catch(() => ({}))
      // Transient problems (expired session, server error, per-minute rate
      // limit) keep it queued; the daily-limit 429 is a real answer.
      const transient = res.status === 401 || res.status >= 500 || (res.status === 429 && body.error === 'Too many requests')
      if (transient) break
      removeFromQueue(item.id)
      if (res.ok) result.sent += body.submitted ?? 0
      else result.failed.push(body.error ? `${item.storeName}: ${body.error}` : `Couldn't send your sightings for ${item.storeName}.`)
    }
  } finally {
    flushing = false
  }
  return result
}
