import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PRICE_TO_TIER: Record<string, string> = {
  [process.env.STRIPE_PRICE_HUNTER!]: 'hunter',
  [process.env.STRIPE_PRICE_TRACKER!]: 'tracker',
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.metadata?.supabase_id
      const tier = session.metadata?.tier
      const subscriptionId = session.subscription as string
      if (userId && tier) {
        await supabaseAdmin.from('profiles').update({
          tier,
          stripe_subscription_id: subscriptionId,
        }).eq('id', userId)
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const priceId = sub.items.data[0]?.price.id
      const tier = PRICE_TO_TIER[priceId] ?? 'free'
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', sub.customer as string)
        .single()
      if (profile) {
        await supabaseAdmin.from('profiles').update({ tier, stripe_subscription_id: sub.id }).eq('id', profile.id)
      }
      break
    }

    case 'customer.subscription.deleted': {
      // Subscription cancelled — drop to free at end of billing period
      const sub = event.data.object as Stripe.Subscription
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('stripe_customer_id', sub.customer as string)
        .single()
      if (profile) {
        await supabaseAdmin.from('profiles').update({
          tier: 'free',
          stripe_subscription_id: null,
        }).eq('id', profile.id)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
