import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runKrogerSyncChunk } from '@/lib/krogerSync'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Give each chunk plenty of headroom under Vercel's serverless duration cap
// (default 10s/15s would get killed mid-loop long before a chunk's pairs at
// ~150ms+latency each are done).
export const maxDuration = 60

async function verifyAdmin(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice(7)
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return null
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin ? user : null
}

// Admin-triggered, on top of the scheduled cron sync at /api/cron/kroger-sync
// — pulls fresh availability for every matched store × matched drink pair,
// one chunk per request. Pass `offset: 0` to start; keep POSTing with the
// returned `nextOffset` until `done: true`.
export async function POST(req: NextRequest) {
  if (!await verifyAdmin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { offset: rawOffset } = await req.json().catch(() => ({}))
  const offset = typeof rawOffset === 'number' && rawOffset >= 0 ? rawOffset : 0

  try {
    const result = await runKrogerSyncChunk(offset)
    return NextResponse.json(result)
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Sync failed' }, { status: 500 })
  }
}
