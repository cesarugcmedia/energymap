import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { signInviteToken } from '@/lib/inviteToken'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`invite-accept:${getClientIp(req)}`, 20, 10 * 60 * 1000)) {
    return NextResponse.redirect(new URL('/waitlist?expired=1', req.url))
  }

  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.redirect(new URL('/waitlist', req.url))
  }

  const { data } = await supabaseAdmin
    .from('waitlist')
    .select('email')
    .eq('invite_token', token)
    .single()

  if (!data) {
    return NextResponse.redirect(new URL('/waitlist?expired=1', req.url))
  }

  const res = NextResponse.redirect(new URL('/account?invited=1', req.url))
  // Store the verified invite token signed with an HMAC — no dependency on
  // ADMIN_BYPASS_SECRET, and middleware can verify it without a DB call.
  const signed = await signInviteToken(token)
  res.cookies.set('amped_invited', signed, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
