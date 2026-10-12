import type { CollectionConfig } from 'payload'

import { ownerOnly, signedIn } from './access.ts'

// Visitor statistics, counted by the website itself (src/app/track/route.ts, same design as the
// We-World site): one row per day, page, language, source, device and kind, with a counter. No
// cookies, no IP address, no personal data, so no cookie banner is needed. Written only by the server.
export const PageViews: CollectionConfig = {
  slug: 'page-views',
  labels: { singular: 'Visit count', plural: 'Website visitors' },
  admin: {
    group: 'Website',
    useAsTitle: 'path',
    defaultColumns: ['day', 'kind', 'path', 'lang', 'source', 'device', 'count'],
    description: 'Counted by the website itself: no cookies, no IP addresses. The home page shows the last 7 days.',
    pagination: { defaultLimit: 50 },
  },
  defaultSort: '-day',
  // One counter row per combination; the /track/ endpoint adds +1 atomically (INSERT ... ON CONFLICT).
  indexes: [{ fields: ['day', 'kind', 'path', 'lang', 'source', 'device'], unique: true }],
  access: { create: () => false, read: signedIn, update: () => false, delete: ownerOnly },
  fields: [
    { name: 'day', type: 'text', required: true, index: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'view',
      index: true,
      label: 'What',
      options: [
        { label: 'Page view', value: 'view' },
        { label: 'WhatsApp click', value: 'whatsapp' },
        { label: 'Email click', value: 'email' },
        { label: 'Phone click', value: 'phone' },
      ],
    },
    { name: 'path', type: 'text', required: true, index: true, label: 'Page' },
    { name: 'lang', type: 'text', label: 'Language' },
    { name: 'source', type: 'text', label: 'Came from', admin: { description: 'The website the visitor came from, or "direct".' } },
    { name: 'device', type: 'text' },
    { name: 'count', type: 'number', required: true, defaultValue: 0 },
  ],
}
