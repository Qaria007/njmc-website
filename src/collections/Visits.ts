import type { CollectionConfig } from 'payload'

import { ownerOnly, signedIn } from './access.ts'

// One row per visitor session (a visitor on one day), written only by src/app/track/route.ts.
// What is stored: the day, a one-way code of the visitor that changes every day (so a person cannot
// be followed from one day to the next), the country and city from an offline GeoIP table, the
// network the visit came from (reverse DNS of the address, often the ISP or the company), the
// referring website, the pages seen in order, and the device type. No IP address, no cookie, no name.
export const Visits: CollectionConfig = {
  slug: 'visits',
  labels: { singular: 'Visit', plural: 'Website visits' },
  admin: {
    group: 'Website',
    useAsTitle: 'summary',
    defaultColumns: ['startedAt', 'country', 'city', 'network', 'source', 'pageCount', 'device'],
    description: 'One row per visitor and day: where they came from, which pages they saw. No IP addresses or cookies are stored.',
    pagination: { defaultLimit: 50 },
    listSearchableFields: ['country', 'city', 'network', 'source', 'landing'],
  },
  defaultSort: '-startedAt',
  indexes: [{ fields: ['day', 'visitor'], unique: true }],
  access: { create: () => false, read: signedIn, update: () => false, delete: ownerOnly },
  fields: [
    { name: 'summary', type: 'text', admin: { hidden: true } },
    { name: 'day', type: 'text', required: true, index: true },
    { name: 'visitor', type: 'text', required: true, index: true, admin: { hidden: true } },
    {
      type: 'row',
      fields: [
        { name: 'startedAt', type: 'date', required: true, index: true, label: 'First page', admin: { date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'lastAt', type: 'date', required: true, label: 'Last page', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'country', type: 'text', index: true },
        { name: 'countryCode', type: 'text', admin: { hidden: true } },
        { name: 'city', type: 'text' },
      ],
    },
    { name: 'network', type: 'text', admin: { description: 'The network the visit came from (the internet provider, or the company when it has its own address).' } },
    {
      type: 'row',
      fields: [
        { name: 'source', type: 'text', label: 'Came from', admin: { description: 'The website that sent the visitor, or "direct".' } },
        { name: 'device', type: 'text' },
        { name: 'lang', type: 'text', label: 'Language' },
      ],
    },
    { name: 'landing', type: 'text', label: 'First page seen', index: true },
    { name: 'pageCount', type: 'number', required: true, defaultValue: 1, label: 'Pages seen' },
    { name: 'contactClicks', type: 'number', required: true, defaultValue: 0, label: 'Contact clicks', admin: { description: 'WhatsApp, e-mail or phone links clicked' } },
    {
      name: 'pages',
      type: 'array',
      label: 'Pages, in order',
      admin: { initCollapsed: true },
      fields: [
        { name: 'path', type: 'text', required: true },
        { name: 'at', type: 'date', admin: { date: { pickerAppearance: 'dayAndTime' } } },
      ],
    },
  ],
}
