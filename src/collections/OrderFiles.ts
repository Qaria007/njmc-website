import path from 'node:path'

import { APIError, type CollectionConfig } from 'payload'

import { signedIn, trashAccess } from './access.ts'

// Customer order files uploaded for Order matching. Private: customer names, quantities and prices
// are confidential (docs/02), so only a signed-in admin can read or download them. They live in
// their own folder (ORDERS_DIR, its own Docker volume), never under the public Media folder.
export const ORDERS_DIR = path.resolve(process.env.ORDERS_DIR || 'private-orders')
// Photos (JPG, PNG, WebP) and scanned PDFs are read by the AI when AI mode is on (src/lib/order-ai.ts).
const ALLOWED = /\.(xlsx|csv|docx|pdf|txt|jpe?g|png|webp)$/i
export const OrderFiles: CollectionConfig = {
  slug: 'order-files',
  labels: { singular: 'Order file', plural: 'Order files' },
  admin: { group: 'Orders', hidden: false, description: 'Uploaded customer orders (private). Uploaded by mistake? Delete it: it goes to the Trash and can be restored from there.' },
  // Delete moves the file to the Trash (staff and owner); only the owner deletes it from the Trash for good.
  trash: true,
  access: { read: signedIn, create: signedIn, update: signedIn, delete: trashAccess },
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
      'image/jpeg',
      'image/png',
      'image/webp',
    ],
  },
  hooks: {
    // A file still used by an order goes to the Trash only with its order (OrderMatches trashGuard).
    beforeChange: [
      async ({ data, originalDoc, req, operation, context }) => {
        if (operation !== 'update' || data.deletedAt == null || originalDoc?.deletedAt || context?.withOrder) return data
        const used = await req.payload.count({ collection: 'order-matches', where: { orderFile: { equals: originalDoc?.id } }, overrideAccess: true, req })
        if (used.totalDocs) throw new APIError('This file belongs to a customer order: delete the order instead, and the file goes to the Trash with it.', 400, undefined, true)
        return data
      },
    ],
    beforeValidate: [
      ({ data, req }) => {
        const name = req.file?.name ?? data?.filename
        if (name && !ALLOWED.test(String(name))) throw new APIError('Order files must be Excel (.xlsx), CSV, Word (.docx), PDF, .txt or a photo (JPG, PNG). iPhone HEIC photos: send them as JPG', 400, undefined, true)
        return data
      },
    ],
  },
  fields: [{ name: 'note', type: 'text' }],
}
