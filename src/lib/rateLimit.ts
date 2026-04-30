const store = new Map<string, { count: number; resetAt: number }>()

// Returns true if the request is allowed, false if it should be blocked.
// Uses a per-instance in-memory sliding window — good protection against
// burst abuse even though it isn't shared across serverless instances.
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || now >= entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

import { NextRequest } from 'next/server'

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}
