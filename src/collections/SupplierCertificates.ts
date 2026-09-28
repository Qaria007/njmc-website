import type { CollectionConfig } from 'payload'

import { signedIn } from './access.ts'

const SOON_DAYS = 60

// Valid / expires soon / expired, worked out on every read so the admin list is always current.
export function certificateState(validUntil?: string | null, now = new Date()): string {
  if (!validUntil) return 'No expiry date'
  const days = Math.floor((new Date(validUntil).getTime() - now.getTime()) / 86_400_000)
  if (days < 0) return 'EXPIRED'
  if (days <= SOON_DAYS) return `Expires in ${days} days`
  return 'Valid'
}

export const CERT_TYPES = [
  { label: 'China GMP certificate (old format)', value: 'cn-gmp' },
  { label: 'China drug manufacturing licence', value: 'cn-dml' },
  { label: 'EU GMP', value: 'eu-gmp' },
  { label: 'US FDA inspection', value: 'us-fda' },
  { label: 'WHO GMP', value: 'who-gmp' },
  { label: 'CEP', value: 'cep' },
  { label: 'US DMF', value: 'us-dmf' },
  { label: 'Written confirmation (WC)', value: 'wc' },
  { label: 'IPEC-PQG GMP', value: 'ipec-gmp' },
  { label: 'ISO 9001', value: 'iso-9001' },
  { label: 'ISO 13485', value: 'iso-13485' },
  { label: 'ISO 22000', value: 'iso-22000' },
  { label: 'FSSC 22000', value: 'fssc-22000' },
  { label: 'Business licence', value: 'business-licence' },
  { label: 'Other', value: 'other' },
]

// Supplier certificates and licences. Private, like Suppliers (docs/02 "Confidentiality").
export const SupplierCertificates: CollectionConfig = {
  slug: 'supplier-certificates',
  labels: { singular: 'Supplier certificate', plural: 'Supplier certificates' },
  admin: {
    useAsTitle: 'title',
    group: 'Catalogue',
    defaultColumns: ['title', 'supplier', 'validUntil', 'state'],
    description: 'Sort by "Valid until" to see what expires next.',
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  timestamps: true,
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        const type = data.type ?? originalDoc?.type
        const label = CERT_TYPES.find((t) => t.value === type)?.label ?? type
        data.title = [label, data.number ?? originalDoc?.number].filter(Boolean).join(' ')
        return data
      },
    ],
  },
  fields: [
    { name: 'title', type: 'text', admin: { readOnly: true, description: 'Filled in automatically' } },
    { name: 'supplier', type: 'relationship', relationTo: 'suppliers', required: true },
    {
      type: 'row',
      fields: [
        { name: 'type', type: 'select', required: true, options: CERT_TYPES },
        { name: 'number', type: 'text', label: 'Certificate number' },
      ],
    },
    { name: 'issuer', type: 'text', label: 'Issued by' },
    { name: 'scope', type: 'textarea' },
    {
      type: 'row',
      fields: [
        { name: 'issued', type: 'date', admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'validUntil', type: 'date', label: 'Valid until', admin: { date: { pickerAppearance: 'dayOnly' } } },
      ],
    },
    {
      name: 'state',
      type: 'text',
      virtual: true,
      admin: { readOnly: true },
      hooks: { afterRead: [({ siblingData }) => certificateState(siblingData?.validUntil)] },
    },
    { name: 'sourceFile', type: 'text', admin: { description: 'File name or Drive link of the copy we hold' } },
    { name: 'notes', type: 'textarea' },
  ],
}
