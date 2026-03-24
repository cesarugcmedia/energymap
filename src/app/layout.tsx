import type { Metadata } from 'next'
import './globals.css'
import BottomNav from '@/components/BottomNav'

export const metadata: Metadata = {
  title: 'EnergyMap',
  description: 'Find energy drinks near you',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-[#0a0a0f] text-white">
        <div className="relative flex flex-col min-h-screen max-w-md mx-auto">
          <main className="flex-1 pb-[70px]">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  )
}
