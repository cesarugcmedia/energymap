import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import MainWrapper from '@/components/MainWrapper'
import AppStartGuard from '@/components/AppStartGuard'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeContext'

const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-barlow' })
const barlowCondensed = Barlow_Condensed({ subsets: ['latin'], weight: ['400', '600', '700', '800'], variable: '--font-barlow-condensed' })

export const metadata: Metadata = {
  title: 'Amped Map',
  description: 'Find energy drinks near you — powered by the community.',
  openGraph: {
    title: 'Amped Map',
    description: 'Find energy drinks near you — powered by the community.',
    siteName: 'Amped Map',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Amped Map',
    description: 'Find energy drinks near you — powered by the community.',
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
    <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`}>
      <head>
        {/* Prevent flash of wrong theme on load */}
        <script dangerouslySetInnerHTML={{ __html: `(function(){var t=localStorage.getItem('em-theme');if(t==='light')document.documentElement.dataset.theme='light';})();` }} />
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
          <div className="relative flex flex-col h-[100dvh] overflow-hidden md:ml-[220px]" style={{ zIndex: 1 }}>
            <MainWrapper>{children}</MainWrapper>
            <BottomNav />
          </div>
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  )
}
