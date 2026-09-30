import type { CollectionConfig } from 'payload'

// Uploads live on the njmc_media Docker volume (MEDIA_DIR). docs/02 confidentiality rules
// apply to the file name and alt text as much as to the image itself.
export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  upload: {
    staticDir: process.env.MEDIA_DIR || 'media',
    mimeTypes: ['image/*'],
    // Public images are flat files. Refuse any name that points into a sub-folder, so nothing
    // stored under MEDIA_DIR in a sub-folder can ever be served through this public route.
    handlers: [
      (_req, { params }) => {
        if (/[\\/]|%2f|%5c|\.\./i.test(params.filename)) return new Response(null, { status: 404 })
      },
    ],
  },
  fields: [
    { name: 'alt', type: 'text', required: true, localized: true },
  ],
}
