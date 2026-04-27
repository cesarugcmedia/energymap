import type { Metadata, Viewport } from 'next'
import { DM_Sans, Bebas_Neue } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import MainWrapper from '@/components/MainWrapper'
import AppStartGuard from '@/components/AppStartGuard'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'
import { AuthProvider } from '@/contexts/AuthContext'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const bebasNeue = Bebas_Neue({ subsets: ['latin'], weight: '400', variable: '--font-bebas-neue' })

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
    <html lang="en" className={`${dmSans.variable} ${bebasNeue.variable}`}>
      <body className="bg-[#070710] text-white">
        <AuthProvider>
          {/* Ambient background — fixed so it covers the full viewport */}
          <div
            aria-hidden
            style={{
              position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
              background: 'radial-gradient(ellipse 70% 45% at 15% 15%, rgba(34,197,94,0.07) 0%, transparent 60%), radial-gradient(ellipse 60% 45% at 85% 85%, rgba(249,115,22,0.05) 0%, transparent 60%)',
            }}
          />
          <div
            aria-hidden
            style={{
              position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
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
        </AuthProvider>
      </body>
    </html>
  )
}
