import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key || key !== process.env.ADMIN_BYPASS_SECRET) {
    return NextResponse.json({ error: 'Invalid key' }, { status: 401 })
  }

  const res = NextResponse.redirect(new URL('/', req.url))
  res.cookies.set('amped_bypass', process.env.ADMIN_BYPASS_SECRET!, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
  return res
}
