import { existsSync, readdirSync, readFileSync } from 'node:fs'

import { withPayload } from '@payloadcms/next/withPayload'

// Every old Hostinger URL 301s to its new URL (docs/old-site/redirect-map.csv, docs/03).
const oldUrls = readFileSync(new URL('./docs/old-site/redirect-map.csv', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split(','))
  .filter(([from, to]) => from && to && to.startsWith('/'))
  .map(([from, to]) => ({ source: from, destination: to, permanent: true }))

// Old static-site article URLs (/insights-<slug>.html, /ar/insights-<slug>.html) for EVERY article,
// including those published after the 27 Sep move (the map above froze at that date). Built from
// src/content so each new article gets its redirect automatically. Added 17 Oct 2026.
const contentDir = (loc) => new URL(`./src/content/${loc}/`, import.meta.url)
const articleSlugs = (loc) =>
  existsSync(contentDir(loc))
    ? readdirSync(contentDir(loc)).filter((f) => f.startsWith('insights__') && f.endsWith('.json')).map((f) => f.slice(10, -5))
    : []
const mapped = new Set(oldUrls.map((r) => r.source))
const articleRedirects = [
  ...articleSlugs('en').map((s) => ({ source: `/insights-${s}.html`, destination: `/insights/${s}/`, permanent: true })),
  ...articleSlugs('ar').map((s) => ({ source: `/ar/insights-${s}.html`, destination: `/ar/insights/${s}/`, permanent: true })),
].filter((r) => !mapped.has(r.source))

// The old preview address served a full copy of the site; send it to the real domain (17 Oct 2026).
// Matched by host only, so requests to the container itself (health checks on 127.0.0.1) are untouched.
const previewHost = { source: '/:path*', has: [{ type: 'host', value: 'njmc.187-127-158-97.sslip.io' }], destination: 'https://njmcmedicsupp.com/:path*', permanent: true }

// No includeSubDomains: drqaria.njmcmedicsupp.com is out of scope and not ours to force.
const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // The offline GeoIP table (geoip-lite) is read from disk at run time: keep it in the standalone image.
  outputFileTracingIncludes: { '/track': ['./node_modules/geoip-lite/data/**/*'] },
  // Loaded from node_modules at run time (it finds its data files by its own folder), not bundled.
  serverExternalPackages: ['geoip-lite'],
  trailingSlash: true,
  poweredByHeader: false,
  async redirects() {
    return [previewHost, ...oldUrls, ...articleRedirects]
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
