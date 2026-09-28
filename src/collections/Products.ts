import type { CollectionConfig } from 'payload'

import { signedIn, signedInField } from './access.ts'
import { importCatalogue } from './catalogue-import.ts'

// Public catalogue (/catalogue/). Visitors see published products and only the product facts;
// which manufacturer makes a product, its documents and our notes are admin-only fields
// (docs/02 "Confidentiality": never publish supplier names or supplier documents).
// Public text is not seen by claims-lint (it scans files), so the site's hard rules are checked here.
const PUBLIC_TEXT = ['name', 'otherNames', 'productClass', 'cas', 'ciNumber'] as const
const BANNED = /[\u2013\u2014!\uFF01]/

export const Products: CollectionConfig = {
  slug: 'products',
  admin: {
    useAsTitle: 'name',
    group: 'Catalogue',
    defaultColumns: ['name', 'category', 'productClass', 'published', 'updatedAt'],
  },
  access: {
    read: ({ req }) => (req.user ? true : { published: { equals: true } }),
    create: signedIn,
    update: signedIn,
    delete: () => false,
  },
  endpoints: [{ path: '/import', method: 'post', handler: importCatalogue }],
  hooks: {
    beforeValidate: [
      ({ data }) => {
        for (const f of PUBLIC_TEXT) {
          const v = data?.[f]
          if (typeof v === 'string' && BANNED.test(v)) throw new Error(`${f}: no dashes (en or em) or exclamation marks (docs/02)`)
        }
        return data
      },
    ],
  },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      validate: (v: unknown) => (typeof v === 'string' && /^[a-z0-9-]{1,120}$/.test(v)) || 'Lower-case letters, digits and hyphens only',
      admin: { description: 'Web address: /catalogue/<slug>/ (lower case, hyphens)' },
    },
    {
      name: 'published',
      type: 'checkbox',
      defaultValue: false,
      admin: { position: 'sidebar', description: 'Shown on the public catalogue' },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'category',
          type: 'select',
          required: true,
          options: [
            { label: 'Active pharmaceutical ingredient', value: 'api' },
            { label: 'Excipient', value: 'excipient' },
            { label: 'Pharmaceutical colour', value: 'colour' },
          ],
        },
        { name: 'productClass', type: 'text', label: 'Class', admin: { description: 'Therapeutic class, or colour type' } },
      ],
    },
    { name: 'otherNames', type: 'text', label: 'Other names' },
    {
      type: 'row',
      fields: [
        { name: 'cas', type: 'text', label: 'CAS number' },
        { name: 'ciNumber', type: 'text', label: 'C.I. number' },
      ],
    },
    {
      name: 'grades',
      type: 'select',
      hasMany: true,
      options: ['EP', 'USP', 'BP', 'JP', 'ChP', 'IP', 'In-house'].map((g) => ({ label: g, value: g })),
    },
    // Private from here on.
    {
      name: 'sources',
      type: 'array',
      access: { read: signedInField },
      admin: { description: 'Private: manufacturers and their documents for this product' },
      fields: [
        { name: 'supplier', type: 'relationship', relationTo: 'suppliers', required: true },
        { name: 'documents', type: 'text', admin: { description: 'e.g. CEP, US DMF, WC, EU GMP' } },
        { name: 'marketStatus', type: 'text', admin: { description: 'e.g. permitted in: India, EU, USA' } },
        { name: 'details', type: 'textarea' },
      ],
    },
    { name: 'internalNotes', type: 'textarea', access: { read: signedInField } },
  ],
}
