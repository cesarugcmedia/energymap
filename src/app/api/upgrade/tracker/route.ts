import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rateLimit'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const BETA_LIMIT = 0 // TODO: set back to 60 after Stripe test

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!checkRateLimit(`upgrade:${user.id}`, 5, 10 * 60 * 1000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const { username } = await req.json().catch(() => ({}))

  // Authoritative server-side count — cannot be bypassed by the client
  const { count } = await supabaseAdmin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tier', 'tracker')

  if ((count ?? 0) < BETA_LIMIT) {
    // Free beta spot available — upsert profile with tracker tier
    await supabaseAdmin
      .from('profiles')
      .upsert({ id: user.id, username: username ?? user.email?.split('@')[0] ?? 'user', tier: 'tracker' })
    return NextResponse.json({ upgraded: true })
  }

  // No free spots — create Stripe checkout
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()

  let customerId = profile?.stripe_customer_id
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { supabase_id: user.id } })
    customerId = customer.id
    await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: process.env.STRIPE_PRICE_TRACKER!, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?payment=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/account?payment=cancelled`,
    metadata: { supabase_id: user.id, tier: 'tracker', username: username ?? '' },
  })

  return NextResponse.json({ url: session.url })
}
