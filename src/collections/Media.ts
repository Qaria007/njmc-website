import type { CollectionConfig } from 'payload'

// Uploads live on the njmc_media Docker volume (MEDIA_DIR). docs/02 confidentiality rules
// apply to the file name and alt text as much as to the image itself.
export const Media: CollectionConfig = {
  slug: 'media',
  access: { read: () => true },
  upload: {
    staticDir: process.env.MEDIA_DIR || 'media',
    mimeTypes: ['image/*'],
  },
  fields: [
    { name: 'alt', type: 'text', required: true, localized: true },
  ],
}
