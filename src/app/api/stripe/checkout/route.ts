import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRICE_MAP: Record<string, string> = {
  hunter: process.env.STRIPE_PRICE_HUNTER!,
  tracker: process.env.STRIPE_PRICE_TRACKER!,
}

export async function POST(req: NextRequest) {
  const { tier, userId, email } = await req.json()

  if (!tier || !userId || !PRICE_MAP[tier]) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
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
    metadata: { supabase_id: userId, tier },
  })

  return NextResponse.json({ url: session.url })
}
