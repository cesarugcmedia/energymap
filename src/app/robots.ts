import type { MetadataRoute } from 'next'

// Public marketing/legal pages are crawlable; app-only and private routes
// (admin, API, auth callback, signed-in flows) are kept out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/auth/', '/submit', '/notifications', '/lists', '/add-store'],
    },
    sitemap: 'https://ampedmap.com/sitemap.xml',
    host: 'https://ampedmap.com',
  }
}
