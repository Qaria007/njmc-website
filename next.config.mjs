import { readFileSync } from 'node:fs'

import { withPayload } from '@payloadcms/next/withPayload'

// Every old Hostinger URL 301s to its new URL (docs/old-site/redirect-map.csv, docs/03).
const oldUrls = readFileSync(new URL('./docs/old-site/redirect-map.csv', import.meta.url), 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split(','))
  .filter(([from, to]) => from && to && to.startsWith('/'))
  .map(([from, to]) => ({ source: from, destination: to, permanent: true }))

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
  trailingSlash: true,
  poweredByHeader: false,
  async redirects() {
    return oldUrls
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
