import type { CollectionConfig } from 'payload'

// RFQs and verification orders from the website forms (docs/03 "Forms and CRM").
// Created only by the server action in src/lib/enquiry.ts; never by the public API.
export const Leads: CollectionConfig = {
  slug: 'leads',
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['createdAt', 'type', 'name', 'company', 'country', 'service', 'status'],
  },
  access: {
    create: () => false,
    read: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: () => false,
  },
  timestamps: true,
  fields: [
    {
      name: 'type',
      type: 'select',
      required: true,
      options: [
        { label: 'Request for quotation', value: 'rfq' },
        { label: 'Verification order', value: 'verification' },
      ],
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'new',
      options: ['new', 'replied', 'quoted', 'won', 'closed'].map((v) => ({ label: v, value: v })),
    },
    { name: 'name', type: 'text', required: true },
    { name: 'company', type: 'text' },
    { name: 'role', type: 'text' },
    { name: 'country', type: 'text', required: true },
    { name: 'email', type: 'email', required: true },
    { name: 'phone', type: 'text', admin: { description: 'Phone or WhatsApp' } },
    { name: 'service', type: 'text' },
    { name: 'supplier', type: 'text', admin: { description: 'Verification orders: supplier or product to check' } },
    { name: 'message', type: 'textarea', required: true },
    { name: 'heardAbout', type: 'text', label: 'How did you hear about us?' },
    { name: 'consent', type: 'checkbox', required: true },
    { name: 'page', type: 'text', admin: { readOnly: true } },
    { name: 'utmFirst', type: 'text', admin: { readOnly: true } },
    { name: 'utmLast', type: 'text', admin: { readOnly: true } },
    { name: 'emailed', type: 'checkbox', admin: { readOnly: true, description: 'Notification reached the mail relay' } },
  ],
}
