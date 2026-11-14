import type { Metadata, Viewport } from 'next'
import { Barlow, Barlow_Condensed } from 'next/font/google'
import './globals.css'
import BottomNav from '@/components/BottomNav'
import SideNav from '@/components/SideNav'
import MainWrapper from '@/components/MainWrapper'
import ContentShell from '@/components/ContentShell'
import ScrollReveal from '@/components/ScrollReveal'
import ReportQueueSync from '@/components/ReportQueueSync'
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
  themeColor: '#0A0B0A',
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
            never see a flash of the marketing page. Also applies the saved
            appearance (Account → Appearance) so light mode never flashes dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{var d=document.documentElement,a=0;for(var i=0;i<localStorage.length;i++){if(/^sb-.+-auth-token$/.test(localStorage.key(i)||'')){d.setAttribute('data-authed','1');a=1;break}}var t=localStorage.getItem('ampedmap_theme');if(a&&(t==='light'||(t==='system'&&matchMedia('(prefers-color-scheme: light)').matches)))d.setAttribute('data-theme','light')}catch(e){}",
          }}
        />
      </head>
      <body>
        <AuthProvider>
          <ThemeProvider>
          <AppStartGuard />
          <ServiceWorkerRegister />
          <ScrollReveal />
          <ReportQueueSync />
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
