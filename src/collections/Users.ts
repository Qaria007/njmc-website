import { type Access, APIError, type CollectionConfig } from 'payload'

import { isOwner, isStaff } from './access.ts'

// Admin accounts with a role (see access.ts). Only the owner adds accounts or changes roles; anyone
// may change their own name and password. Client-portal logins are a separate collection.
const ownerOrSelf: Access = ({ req, id }) => isOwner(req) || (isStaff(req) && id != null && String(id) === String(req.user?.id))

export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Staff account', plural: 'Staff accounts' },
  admin: { useAsTitle: 'email', defaultColumns: ['email', 'name', 'role'], group: 'Settings' },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
  },
  access: {
    read: ({ req }) => isStaff(req) || (req.user?.collection === 'users' ? { id: { equals: req.user.id } } : false),
    create: ({ req }) => isOwner(req),
    update: ownerOrSelf,
    delete: () => false,
    unlock: ({ req }) => isOwner(req),
    // The admin screens are for owner and staff; the importer login only uses the API.
    admin: ({ req }) => isStaff(req),
  },
  hooks: {
    // The very first account is the owner; later ones are staff unless the owner chooses otherwise.
    beforeChange: [
      async ({ data, operation, originalDoc, req }) => {
        if (operation === 'create' && !data.role) {
          const any = await req.payload.count({ collection: 'users', overrideAccess: true, req })
          data.role = any.totalDocs === 0 ? 'owner' : 'staff'
        }
        // There must always be an owner left (an account without a role is an owner).
        if (operation === 'update' && data.role && data.role !== 'owner' && originalDoc && (!originalDoc.role || originalDoc.role === 'owner')) {
          const owners = await req.payload.count({ collection: 'users', where: { or: [{ role: { equals: 'owner' } }, { role: { exists: false } }] }, overrideAccess: true, req })
          if (owners.totalDocs <= 1) throw new APIError('This is the last owner account: make another account owner first', 400, undefined, true)
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'name', type: 'text' },
    {
      name: 'role', type: 'select', label: 'Role',
      options: [
        { label: 'Owner (everything)', value: 'owner' },
        { label: 'Staff (orders and documents; no money, profit, costs or settings)', value: 'staff' },
        { label: 'Importer (Product Importer login: adds unpublished products only)', value: 'importer' },
      ],
      access: { update: ({ req }) => isOwner(req), create: ({ req }) => isOwner(req) },
      admin: { description: 'An account without a role is an owner (accounts made before roles existed)' },
    },
  ],
}
