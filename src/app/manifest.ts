import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Amped Map',
    short_name: 'AmpedMap',
    description: 'Find energy drinks near you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#070710',
    theme_color: '#070710',
    icons: [
      {
        src: '/icon',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
