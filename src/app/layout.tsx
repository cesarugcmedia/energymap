import type { Metadata, Viewport } from 'next'
import { DM_Sans, Bebas_Neue } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import MainWrapper from '@/components/MainWrapper'
import { AuthProvider } from '@/contexts/AuthContext'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const bebasNeue = Bebas_Neue({ subsets: ['latin'], weight: '400', variable: '--font-bebas-neue' })

export const metadata: Metadata = {
  title: 'EnergyMap',
  description: 'Find energy drinks near you',
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
          <div className="relative flex flex-col max-w-md mx-auto h-[100dvh] overflow-hidden">
            {/* Ambient background glow — matches the account/signup page aesthetic */}
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
                background: 'radial-gradient(ellipse 70% 45% at 15% 15%, rgba(34,197,94,0.07) 0%, transparent 60%), radial-gradient(ellipse 60% 45% at 85% 85%, rgba(249,115,22,0.05) 0%, transparent 60%)',
              }}
            />
            <div
              aria-hidden
              style={{
                position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
            {/* Content */}
            <div className="relative flex flex-col flex-1 overflow-hidden" style={{ zIndex: 1 }}>
              <MainWrapper>{children}</MainWrapper>
              <BottomNav />
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  )
}
