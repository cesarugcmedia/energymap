import { NextRequest, NextResponse } from 'next/server'

const BYPASS_COOKIE = 'amped_bypass'

export function middleware(req: NextRequest) {
  if (process.env.MIDDLEWARE_WAITLIST_ACTIVE !== '1') return NextResponse.next()

  const { pathname } = req.nextUrl

  // Always pass through: waitlist page, its API, admin bypass, assets, SW, auth callbacks
  if (
    pathname.startsWith('/waitlist') ||
    pathname.startsWith('/api/waitlist') ||
    pathname.startsWith('/api/admin/bypass') ||
    pathname.startsWith('/api/invite') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/_next') ||
    pathname === '/sw.js' ||
    pathname === '/offline' ||
    pathname === '/icon' ||
    pathname.startsWith('/icon') ||
    pathname === '/manifest.webmanifest'
  ) {
    return NextResponse.next()
  }

  // Admin bypass cookie grants full app access
  const bypass = req.cookies.get(BYPASS_COOKIE)
  if (bypass?.value && bypass.value === process.env.ADMIN_BYPASS_SECRET) {
    return NextResponse.next()
  }

  // Invite bypass — set when a user accepts a waitlist invite link
  const invited = req.cookies.get('amped_invited')
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (invited?.value && uuidPattern.test(invited.value)) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/waitlist', req.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
