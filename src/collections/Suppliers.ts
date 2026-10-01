import type { CollectionConfig } from 'payload'

import { signedIn } from './access.ts'

// Manufacturers NJMC sources from. Private: docs/02 "Confidentiality" forbids publishing any
// supplier name, so nothing here is readable without an admin login.
export const Suppliers: CollectionConfig = {
  slug: 'suppliers',
  admin: {
    useAsTitle: 'name',
    group: 'Catalogue',
    defaultColumns: ['name', 'country', 'city', 'supplies', 'status'],
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  timestamps: true,
  fields: [
    { name: 'name', type: 'text', required: true, unique: true },
    { name: 'nameLocal', type: 'text', label: 'Name in local language' },
    {
      type: 'row',
      fields: [
        { name: 'country', type: 'text', required: true },
        { name: 'city', type: 'text' },
      ],
    },
    { name: 'address', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'website', type: 'text' },
        { name: 'email', type: 'text' },
        { name: 'phone', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'contactPerson', type: 'text', label: 'Contact person', admin: { description: 'Name and title, e.g. from the business card' } },
        { name: 'wechat', type: 'text', label: 'WeChat / WhatsApp' },
      ],
    },
    {
      name: 'supplies',
      type: 'select',
      hasMany: true,
      options: [
        { label: 'APIs', value: 'api' },
        { label: 'Intermediates', value: 'intermediate' },
        { label: 'Excipients', value: 'excipient' },
        { label: 'Colours', value: 'colour' },
        { label: 'Medical devices', value: 'device' },
        { label: 'Medical consumables', value: 'consumable' },
        { label: 'Other', value: 'other' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      options: [
        { label: 'New (documents received)', value: 'new' },
        { label: 'Contacted', value: 'contacted' },
        { label: 'Samples', value: 'samples' },
        { label: 'Qualified', value: 'qualified' },
        { label: 'Approved', value: 'approved' },
        { label: 'On hold', value: 'on-hold' },
        { label: 'Rejected', value: 'rejected' },
      ],
    },
    { name: 'source', type: 'text', admin: { description: 'Where we met them, e.g. CPHI Shanghai 2026' } },
    { name: 'documentsFolder', type: 'text', admin: { description: 'Link to the Drive folder or files' } },
    { name: 'notes', type: 'textarea' },
  ],
}
