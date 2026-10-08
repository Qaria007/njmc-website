import type { CollectionConfig } from 'payload'

import { signedIn } from './access.ts'
import { CURRENCIES, INCOTERMS } from './SupplierOrders.ts'

// The companies we sell to. Filled in once; a proforma invoice for a client copies the name, address,
// contact and usual terms. Private: client names are confidential (docs/02).
export const Clients: CollectionConfig = {
  slug: 'clients',
  labels: { singular: 'Client', plural: 'Clients' },
  admin: {
    group: 'Orders',
    useAsTitle: 'name',
    defaultColumns: ['name', 'country', 'contactPerson', 'email'],
    description: 'Companies we sell to. Their documents, sales and payments are listed on each client.',
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  timestamps: true,
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Details',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'name', type: 'text', required: true, unique: true, label: 'Company name', admin: { description: 'In English, as it must appear on the invoice' } },
                { name: 'country', type: 'text' },
                { name: 'registrationNo', type: 'text', label: 'Registration or tax no.' },
              ],
            },
            { name: 'address', type: 'textarea', admin: { rows: 3 } },
            {
              type: 'row',
              fields: [
                { name: 'contactPerson', type: 'text', label: 'Contact person' },
                { name: 'email', type: 'text', admin: { description: 'Documents are sent here. Several addresses: separate with commas' } },
                { name: 'phone', type: 'text', label: 'Phone / WhatsApp' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'currency', type: 'select', defaultValue: 'USD', options: CURRENCIES.map((v) => ({ label: v, value: v })) },
                { name: 'incoterm', type: 'select', label: 'Usual price basis', options: INCOTERMS.map((v) => ({ label: v, value: v })) },
                { name: 'incotermPlace', type: 'text', label: 'Port or place', admin: { description: 'e.g. Aden' } },
                { name: 'paymentTerms', type: 'text', label: 'Usual payment terms' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'consignee', type: 'textarea', admin: { rows: 3, description: 'Only if different from the client' } },
                { name: 'notifyParty', type: 'textarea', admin: { rows: 3 } },
              ],
            },
            { name: 'notes', type: 'textarea', label: 'Internal notes' },
          ],
        },
        {
          label: 'Sales',
          fields: [{ name: 'sales', type: 'join', collection: 'buyer-documents', on: 'client', admin: { defaultColumns: ['piNumber', 'invoiceNumber', 'status', 'piDate'] } }],
        },
        {
          label: 'Payments',
          fields: [{ name: 'payments', type: 'join', collection: 'payments', on: 'client', admin: { defaultColumns: ['date', 'direction', 'amount', 'currency', 'reference'] } }],
        },
        {
          label: 'Documents',
          fields: [{ name: 'documents', type: 'join', collection: 'trade-files', on: 'client', admin: { defaultColumns: ['filename', 'kind', 'date', 'title'] } }],
        },
      ],
    },
  ],
}
