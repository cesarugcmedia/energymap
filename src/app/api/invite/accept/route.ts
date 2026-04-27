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

  const res = NextResponse.redirect(new URL('/account', req.url))
  res.cookies.set('amped_bypass', process.env.ADMIN_BYPASS_SECRET!, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
