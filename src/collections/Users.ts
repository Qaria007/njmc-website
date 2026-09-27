import type { CollectionConfig } from 'payload'

// Admin accounts. Kept separate from any future client-portal users (docs/03 "Future-ready"):
// a later portal adds its own auth collection with roles instead of reusing this one.
export const Users: CollectionConfig = {
  slug: 'users',
  admin: { useAsTitle: 'email' },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
  },
  fields: [{ name: 'name', type: 'text' }],
}
