import type { Access, FieldAccess, PayloadRequest } from 'payload'

// Roles of admin accounts (field `role` on users):
// - owner: everything (an account without a role is an owner: the accounts made before roles).
// - staff: daily work (orders, clients, suppliers, documents), but no money totals, profit, costs,
//   bank and company settings, payments or user accounts.
// - importer: a machine login for the Product Importer; may only add unpublished products and photos.
// A future client-portal login is another auth collection and never passes these checks.
export type Role = 'owner' | 'staff' | 'importer'
type U = { collection?: string; role?: string | null } | null | undefined

export const roleOf = (u: U): Role | null => (u?.collection === 'users' ? ((u.role as Role) || 'owner') : null)
export const isStaff = (req: PayloadRequest) => ['owner', 'staff'].includes(roleOf(req.user as U) ?? '')
export const isOwner = (req: PayloadRequest) => roleOf(req.user as U) === 'owner'

export const signedIn: Access = ({ req }) => isStaff(req)
export const signedInField: FieldAccess = ({ req }) => isStaff(req)
export const ownerOnly: Access = ({ req }) => isOwner(req)
export const ownerField: FieldAccess = ({ req }) => isOwner(req)
