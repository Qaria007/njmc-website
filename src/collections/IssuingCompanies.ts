import type { CollectionConfig } from 'payload'

import { cleanPrefix, LICENCE_KINDS, PRODUCT_TYPES } from '../lib/coa-docs.ts'
import { ownerField, ownerOnly, signedIn } from './access.ts'

// Our companies: NJMC and the partner companies the owner works with, everything about each in one
// place: letterhead (logo, address, contacts), the person who signs, bank details, and the licences.
// A certificate on our letterhead is released by one of these, and only by a company whose valid
// licence covers that kind of product. A sale (proforma invoice, invoice) can be issued by one too.
export const IssuingCompanies: CollectionConfig = {
  slug: 'issuing-companies',
  labels: { singular: 'Company', plural: 'Our companies' },
  admin: {
    group: 'Our companies',
    useAsTitle: 'companyName',
    defaultColumns: ['companyName', 'relation', 'prefix', 'updatedAt'],
    description: 'NJMC and partner companies: logo, address, signatory, bank details and licences, in one place. Only add a partner that has agreed to issue documents under its name.',
  },
  access: { read: signedIn, create: ownerOnly, update: ownerOnly, delete: () => false },
  hooks: {
    beforeChange: [
      ({ data, originalDoc }) => {
        if (!data) return data
        const name = String(data.companyName ?? originalDoc?.companyName ?? '')
        data.prefix = cleanPrefix(data.prefix ?? originalDoc?.prefix, cleanPrefix(name.slice(0, 4), 'COA'))
        return data
      },
    ],
  },
  fields: [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Company and letterhead',
          fields: [
            {
              type: 'row',
              fields: [
                { name: 'companyName', type: 'text', required: true, admin: { description: 'Legal name, in English, as on the business licence and the bank account' } },
                { name: 'brandName', type: 'text', label: 'Brand name on documents', admin: { description: 'Optional, e.g. NJMC Medical Supplies: printed large, with the legal name under it' } },
                {
                  name: 'relation', type: 'select', defaultValue: 'own',
                  options: [{ label: 'Our company', value: 'own' }, { label: 'Partner company', value: 'partner' }],
                },
                { name: 'prefix', type: 'text', label: 'Number prefix', admin: { description: '2 to 8 letters, e.g. NJMC gives NJMC-COA-2026-0001' } },
              ],
            },
            { name: 'logo', type: 'upload', relationTo: 'media', admin: { description: 'PNG or JPG, printed at the top of its documents' } },
            {
              type: 'row',
              fields: [
                { name: 'registrationNo', type: 'text', label: 'Registration No.', admin: { description: 'Business licence / unified social credit code' } },
                { name: 'country', type: 'text' },
              ],
            },
            { name: 'address', type: 'textarea', admin: { description: 'Full registered address, in English' } },
            {
              type: 'row',
              fields: [
                { name: 'phone', type: 'text' },
                { name: 'email', type: 'text' },
                { name: 'website', type: 'text' },
              ],
            },
            {
              type: 'row',
              fields: [
                { name: 'signatoryName', type: 'text', label: 'Signs documents (name)', admin: { description: 'Quality approval on certificates; signature on invoices' } },
                { name: 'signatoryTitle', type: 'text', label: 'Title', admin: { description: 'e.g. Quality Manager' } },
              ],
            },
          ],
        },
        {
          label: 'Bank details',
          fields: [
            {
              name: 'bankDetails', type: 'textarea', access: { read: ownerField, update: ownerField },
              admin: { rows: 7, description: 'Printed on proforma invoices and invoices issued by this company: beneficiary, bank, account number, SWIFT, bank address. Owner only' },
            },
          ],
        },
        {
          label: 'Licences',
          description: 'A certificate is released only by a company with a valid licence covering that kind of product.',
          fields: [
            {
              name: 'licences',
              type: 'array',
              labels: { singular: 'Licence', plural: 'Licences' },
              admin: { initCollapsed: false },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'kind', type: 'select', required: true, label: 'Type', options: LICENCE_KINDS },
                    { name: 'number', type: 'text', required: true, label: 'Licence No.' },
                    { name: 'authority', type: 'text', label: 'Issued by (authority)' },
                  ],
                },
                {
                  type: 'row',
                  fields: [
                    { name: 'validFrom', type: 'date', label: 'Valid from', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
                    { name: 'validUntil', type: 'date', label: 'Valid until', admin: { date: { displayFormat: 'yyyy-MM-dd' }, description: 'Empty = no expiry date' } },
                  ],
                },
                { name: 'covers', type: 'select', hasMany: true, required: true, label: 'Covers', options: PRODUCT_TYPES, admin: { description: 'The kinds of product this licence allows the company to supply' } },
                { name: 'printOnCertificate', type: 'checkbox', defaultValue: true, label: 'Print this licence on certificates' },
                { name: 'scan', type: 'relationship', relationTo: 'trade-files', label: 'Copy of the licence (private, in Documents)' },
              ],
            },
          ],
        },
      ],
    },
    { name: 'notes', type: 'textarea', admin: { description: 'Agreement with the partner, who may use it' } },
  ],
}
