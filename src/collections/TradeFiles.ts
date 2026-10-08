import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { APIError, type CollectionConfig } from 'payload'

import { signedIn } from './access.ts'
import { ORDERS_DIR } from './OrderFiles.ts'

// Every paper of a deal in one place: the client's order, contracts, supplier quotations and invoices,
// certificates of analysis, B/L, payment slips, photos. Private, like the order files: they sit in
// their own sub-folder of the private orders volume, never under the public media folder.
export const TRADE_FILES_DIR = path.join(ORDERS_DIR, 'documents')
const ALLOWED = /\.(pdf|xlsx|xls|docx|doc|csv|txt|jpe?g|png|webp|heic|eml|msg)$/i

export const FILE_KINDS = [
  { label: "Client's order or enquiry", value: 'client-order' },
  { label: 'Contract', value: 'contract' },
  { label: 'Proforma invoice (signed or from the supplier)', value: 'pi' },
  { label: 'Supplier quotation', value: 'quotation' },
  { label: 'Commercial invoice', value: 'invoice' },
  { label: 'Packing list', value: 'packing-list' },
  { label: 'Certificate of analysis', value: 'coa' },
  { label: 'Certificate of origin', value: 'co' },
  { label: 'B/L or AWB', value: 'bl' },
  { label: 'Payment slip', value: 'payment' },
  { label: 'Photo', value: 'photo' },
  { label: 'Email or letter', value: 'correspondence' },
  { label: 'Other', value: 'other' },
]

export const TradeFiles: CollectionConfig = {
  slug: 'trade-files',
  labels: { singular: 'Document', plural: 'Documents (clients and suppliers)' },
  admin: {
    group: 'Orders',
    useAsTitle: 'title',
    defaultColumns: ['filename', 'kind', 'client', 'supplier', 'date'],
    listSearchableFields: ['title', 'filename', 'notes'],
    description: 'Upload any paper of a deal and link it to the client, the supplier and the order. It then shows on each of them.',
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  upload: {
    staticDir: TRADE_FILES_DIR,
    mimeTypes: [
      'application/pdf', 'image/*', 'text/plain', 'text/csv', 'message/rfc822',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword',
      'application/vnd.ms-outlook', 'application/zip', 'application/octet-stream',
    ],
  },
  hooks: {
    beforeOperation: [
      async ({ operation }) => {
        if (operation === 'create' || operation === 'update') await mkdir(TRADE_FILES_DIR, { recursive: true })
      },
    ],
    beforeValidate: [
      ({ data, req }) => {
        const name = req.file?.name ?? data?.filename
        if (name && !ALLOWED.test(String(name))) throw new APIError('Allowed: PDF, Excel, Word, CSV, text, images, saved emails', 400, undefined, true)
        if (data && !data.title && name) data.title = String(name).replace(/\.[^.]+$/, '')
        return data
      },
    ],
  },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'title', type: 'text', admin: { description: 'Short description; the file name when empty' } },
        { name: 'kind', type: 'select', defaultValue: 'other', options: FILE_KINDS },
        { name: 'date', type: 'date', admin: { date: { displayFormat: 'yyyy-MM-dd' } } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'client', type: 'relationship', relationTo: 'clients' },
        { name: 'supplier', type: 'relationship', relationTo: 'suppliers' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'order', type: 'relationship', relationTo: 'order-matches', label: 'Customer order' },
        { name: 'buyerDocument', type: 'relationship', relationTo: 'buyer-documents', label: 'Sale (PI / invoice)' },
        { name: 'supplierOrder', type: 'relationship', relationTo: 'supplier-orders', label: 'Enquiry or purchase order' },
      ],
    },
    { name: 'notes', type: 'textarea' },
  ],
}
