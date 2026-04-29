import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
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
  // Store the verified invite token as its own cookie — no dependency on ADMIN_BYPASS_SECRET
  res.cookies.set('amped_invited', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
