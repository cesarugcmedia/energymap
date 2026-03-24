import type { Metadata, Viewport } from 'next'
import './globals.css'
import BottomNav from '@/components/BottomNav'

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
    <html lang="en">
      <body className="bg-[#0a0a0f] text-white">
        <div className="relative flex flex-col max-w-md mx-auto min-h-[100dvh]">
          <main className="flex-1" style={{ paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
            {children}
          </main>
          <BottomNav />
        </div>
      </body>
    </html>
  )
}
