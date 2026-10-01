import type { Access, FieldAccess } from 'payload'

// Admin users only: a future portal login (another auth collection) must not pass.
export const signedIn: Access = ({ req }) => req.user?.collection === 'users'
export const signedInField: FieldAccess = ({ req }) => req.user?.collection === 'users'
