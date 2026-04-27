import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRICE_MAP: Record<string, string> = {
  tracker: process.env.STRIPE_PRICE_TRACKER!,
}

export async function POST(req: NextRequest) {
  try {
    const { tier, userId, email, username } = await req.json()

    if (!tier || !userId || !PRICE_MAP[tier]) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    // Verify the requesting user owns the userId being checked out for
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const token = authHeader.slice(7)
    const { data: { user: authedUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !authedUser || authedUser.id !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user already has a Stripe customer ID
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single()

    let customerId = profile?.stripe_customer_id

    if (!customerId) {
      const customer = await stripe.customers.create({ email, metadata: { supabase_id: userId } })
      customerId = customer.id
      await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', userId)
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICE_MAP[tier], quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?payment=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?payment=cancelled`,
      metadata: { supabase_id: userId, tier, username: username ?? '' },
    })

    return NextResponse.json({ url: session.url })
  } catch (err: any) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: err?.message ?? 'Stripe error' }, { status: 500 })
  }
}
