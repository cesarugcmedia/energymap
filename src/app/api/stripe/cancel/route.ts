import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { userId, resume } = await req.json()

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    }

    // Verify the request comes from the authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user || user.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!checkRateLimit(`cancel:${user.id}`, 5, 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Get stripe customer ID
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    if (!profile?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
    }

    // Find active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: 'active',
      limit: 1,
    })

    // Undo a scheduled cancellation ("Keep Tracker").
    if (resume) {
      if (subscriptions.data.length === 0) {
        return NextResponse.json({ error: 'No active subscription found' }, { status: 400 })
      }
      await stripe.subscriptions.update(subscriptions.data[0].id, { cancel_at_period_end: false })
      return NextResponse.json({ success: true })
    }

    if (subscriptions.data.length === 0) {
      // No active subscription — just downgrade in DB
      await supabaseAdmin.from('profiles').update({ tier: 'free' }).eq('id', userId)
      return NextResponse.json({ success: true })
    }

    // Cancel at the end of the paid period, as the Terms promise. The member
    // keeps Tracker until then; Stripe fires customer.subscription.deleted at
    // period end and the webhook drops the tier to free.
    await stripe.subscriptions.update(subscriptions.data[0].id, { cancel_at_period_end: true })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Cancel subscription error:', err)
    return NextResponse.json({ error: err?.message ?? 'Failed to cancel subscription' }, { status: 500 })
  }
}
