import type { Access, FieldAccess } from 'payload'

export const signedIn: Access = ({ req }) => Boolean(req.user)
export const signedInField: FieldAccess = ({ req }) => Boolean(req.user)
