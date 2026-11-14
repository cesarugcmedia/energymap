import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AmpedMap',
    short_name: 'AmpedMap',
    description: 'Find energy drinks in stock near you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0B0A',
    theme_color: '#0A0B0A',
    icons: [
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
