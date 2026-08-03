import { NextRequest, NextResponse } from 'next/server'
import { runKrogerSyncChunk } from '@/lib/krogerSync'

export const maxDuration = 60

// Vercel Cron hits this on the schedule in vercel.json — no user session
// involved, so it authenticates via CRON_SECRET rather than an admin bearer
// token. Vercel automatically sends `Authorization: Bearer $CRON_SECRET`
// on cron-triggered requests once that env var is set.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Loops through chunks itself (a cron run has no client to keep calling
  // back), stopping with time to spare under maxDuration so the function
  // returns cleanly instead of getting killed mid-chunk. On a small
  // matched-pair catalog this reaches `done` well inside the budget; if the
  // catalog grows large enough to need more than one time-boxed run, revisit
  // this then — the next scheduled run just starts over from the top.
  const startedAt = Date.now()
  const TIME_BUDGET_MS = 50_000
  let offset = 0
  let totalSynced = 0
  let totalFailed = 0
  let totalPairs = 0
  let done = false
  let message: string | undefined

  try {
    while (!done && Date.now() - startedAt < TIME_BUDGET_MS) {
      const result = await runKrogerSyncChunk(offset)
      if (result.message) { message = result.message; done = true; break }
      totalSynced += result.synced
      totalFailed += result.failed
      totalPairs = result.totalPairs
      offset = result.nextOffset
      done = result.done
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Sync failed' }, { status: 500 })
  }

  return NextResponse.json({ synced: totalSynced, failed: totalFailed, totalPairs, offset, done, message })
}
