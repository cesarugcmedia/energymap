import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

// Everything the Account → Plan page shows beyond the tier itself:
// today's usage against the limits /api/stock/report and /add-store enforce,
// and (for paying Tracker members) the Stripe subscription status, renewal
// date, price and card on file. Read-only.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.slice(7))
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!checkRateLimit(`account-plan:${user.id}`, 30, 60 * 1000)) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  const { data: profile } = await supabaseAdmin.from('profiles').select('tier, is_admin, stripe_customer_id, created_at').eq('id', user.id).single()

  // Same day boundary as the enforcement in /api/stock/report and /add-store
  // (server-local midnight; Vercel runs in UTC).
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const [{ count: reportsToday }, { count: storesToday }, { count: reportsTotal }] = await Promise.all([
    supabaseAdmin.from('stock_reports').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('reported_at', todayStart.toISOString()),
    supabaseAdmin.from('stores').select('id', { count: 'exact', head: true }).eq('submitted_by', user.id).gte('created_at', todayStart.toISOString()),
    supabaseAdmin.from('stock_reports').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
  ])
  const resetsAt = new Date(todayStart.getTime() + 86400000).toISOString()

  let subscription: null | {
    status: string
    renewsAt: string | null
    cancelAtPeriodEnd: boolean
    amount: number | null
    currency: string | null
    interval: string | null
    card: { brand: string; last4: string } | null
    startedAt: string | null
  } = null

  if (profile?.stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
      const subs = await stripe.subscriptions.list({ customer: profile.stripe_customer_id, status: 'all', limit: 1, expand: ['data.default_payment_method'] })
      const s = subs.data[0]
      if (s) {
        const item = s.items.data[0]
        const pm = s.default_payment_method as Stripe.PaymentMethod | null
        // current_period_end moved onto subscription items in newer API versions.
        const periodEnd = (item as any)?.current_period_end ?? (s as any).current_period_end ?? null
        subscription = {
          status: s.status,
          renewsAt: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          cancelAtPeriodEnd: !!s.cancel_at_period_end,
          amount: item?.price?.unit_amount ?? null,
          currency: item?.price?.currency ?? null,
          interval: item?.price?.recurring?.interval ?? null,
          card: pm?.card ? { brand: pm.card.brand, last4: pm.card.last4 } : null,
          startedAt: s.start_date ? new Date(s.start_date * 1000).toISOString() : null,
        }
      }
    } catch (e: any) {
      console.error('account/plan: stripe lookup failed', e?.message)
    }
  }

  return NextResponse.json({
    tier: profile?.is_admin ? 'admin' : profile?.tier ?? 'free',
    memberSince: profile?.created_at ?? null,
    usage: { reportsToday: reportsToday ?? 0, reportsLimit: profile?.is_admin ? null : 25, storesToday: storesToday ?? 0, storesLimit: profile?.tier === 'tracker' || profile?.is_admin ? null : 10, resetsAt, reportsTotal: reportsTotal ?? 0 },
    subscription,
  })
}
