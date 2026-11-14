import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import MainWrapper from '@/components/MainWrapper'
import ContentShell from '@/components/ContentShell'
import { Analytics } from '@vercel/analytics/next'
import AppStartGuard from '@/components/AppStartGuard'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'

const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-barlow' })
const barlowCondensed = Barlow_Condensed({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-barlow-condensed' })

export const metadata: Metadata = {
  metadataBase: new URL('https://ampedmap.com'),
  title: 'AmpedMap',
  description: 'See which stores near you have your favorite energy drinks in stock, reported by the community.',
  openGraph: {
    title: 'AmpedMap — Find energy drinks in stock near you',
    description: 'See which stores near you have your favorite energy drinks in stock, reported by the community.',
    siteName: 'AmpedMap',
    type: 'website',
    url: 'https://ampedmap.com',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'AmpedMap — Find energy drinks in stock near you',
    description: 'See which stores near you have your favorite energy drinks in stock, reported by the community.',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`} suppressHydrationWarning>
      <head>
        {/* Before first paint: if a saved Supabase session exists, mark <html>
            so the server-rendered landing page at / is hidden behind a spinner
            while the map loads (see HomeGate + globals.css). Signed-in users
            never see a flash of the marketing page. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{for(var i=0;i<localStorage.length;i++){if(/^sb-.+-auth-token$/.test(localStorage.key(i)||'')){document.documentElement.setAttribute('data-authed','1');break}}}catch(e){}",
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>
          {/* Ambient background — fixed so it covers the full viewport */}
          <div
            aria-hidden
            style={{
              position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
              background: 'radial-gradient(ellipse 70% 45% at 85% 10%, rgba(201,244,0,0.07) 0%, transparent 60%), radial-gradient(ellipse 60% 45% at 15% 85%, rgba(201,244,0,0.03) 0%, transparent 60%)',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
              backgroundImage: 'linear-gradient(rgba(201,244,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(201,244,0,0.03) 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <AppStartGuard />
          <ServiceWorkerRegister />
          {/* Desktop sidebar */}
          <SideNav />
          {/* Main content — offset by sidebar on desktop */}
          <ContentShell>
            <MainWrapper>{children}</MainWrapper>
            <BottomNav />
          </ContentShell>
          </ThemeProvider>
        </AuthProvider>
        {/* Cookieless page-view analytics (enable under Vercel → Analytics). */}
        <Analytics />
      </body>
    </html>
  )
}
