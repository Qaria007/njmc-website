import path from 'node:path'

import { APIError, type CollectionConfig } from 'payload'

import { signedIn } from './access.ts'

// Customer order files uploaded for Order matching. Private: customer names, quantities and prices
// are confidential (docs/02), so only a signed-in admin can read or download them. They live in
// their own folder (ORDERS_DIR, its own Docker volume), never under the public Media folder.
export const ORDERS_DIR = path.resolve(process.env.ORDERS_DIR || 'private-orders')
const ALLOWED = /\.(xlsx|csv|docx|pdf|txt)$/i
export const OrderFiles: CollectionConfig = {
  slug: 'order-files',
  labels: { singular: 'Order file', plural: 'Order files' },
  admin: { group: 'Catalogue', hidden: false, description: 'Uploaded customer orders (private).' },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: () => false },
  upload: {
    staticDir: ORDERS_DIR,
    mimeTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/csv',
      'text/plain',
      // Some browsers and tools send Excel and Word files as generic zip/binary; the reader checks the extension.
      'application/zip',
      'application/octet-stream',
      'application/vnd.ms-excel',
    ],
  },
  hooks: {
    beforeValidate: [
      ({ data, req }) => {
        const name = req.file?.name ?? data?.filename
        if (name && !ALLOWED.test(String(name))) throw new APIError('Order files must be Excel (.xlsx), CSV, Word (.docx), PDF or .txt', 400, undefined, true)
        return data
      },
    ],
  },
  fields: [{ name: 'note', type: 'text' }],
}
