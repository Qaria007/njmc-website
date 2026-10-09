import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site.ts'

// docs/03: search engines and the main AI crawlers are welcome; admin and API are not.
export default function robots(): MetadataRoute.Robots {
  const disallow = ['/admin/', '/api/', '/quote/', '/d/', '/portal/']
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
      ...['Googlebot', 'Bingbot', 'GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'].map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow,
      })),
    ],
    sitemap: SITE_URL + '/sitemap.xml',
  }
}
