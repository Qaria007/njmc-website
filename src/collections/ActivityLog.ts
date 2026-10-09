import type { CollectionAfterChangeHook, CollectionConfig, CollectionSlug } from 'payload'

import { ownerOnly } from './access.ts'

// Who did what: every create and change made in the admin, by which account. Read by the owner only;
// written only by the hook below, never edited or deleted.
export const ActivityLog: CollectionConfig = {
  slug: 'activity-log',
  labels: { singular: 'Activity', plural: 'Activity log' },
  admin: { group: 'Settings', useAsTitle: 'summary', defaultColumns: ['createdAt', 'user', 'action', 'summary'], description: 'Who created or changed what, newest first.' },
  access: { read: ownerOnly, create: () => false, update: () => false, delete: () => false },
  defaultSort: '-createdAt',
  timestamps: true,
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'user', type: 'text', admin: { readOnly: true } },
        { name: 'action', type: 'select', options: ['created', 'changed'].map((v) => ({ label: v, value: v })), admin: { readOnly: true } },
        { name: 'collectionName', type: 'text', label: 'Where', admin: { readOnly: true } },
        { name: 'docId', type: 'text', label: 'Record', admin: { readOnly: true } },
      ],
    },
    { name: 'summary', type: 'text', admin: { readOnly: true } },
    { name: 'fields', type: 'text', label: 'Fields changed', admin: { readOnly: true } },
  ],
}

const SKIP = new Set(['updatedAt', 'createdAt', 'id', 'sendLog', 'quoteLog', 'messageAuto', 'subjectAuto', 'lines', 'matchedAt'])
const label = (doc: Record<string, unknown>) => String(doc.number ?? doc.piNumber ?? doc.name ?? doc.title ?? doc.email ?? doc.filename ?? doc.reference ?? doc.id ?? '').slice(0, 120)

// Added to the collections listed in payload.config.ts. Only changes made by a signed-in admin
// account are logged (not the server's own updates, not suppliers using their price link).
export function logActivity(slug: CollectionSlug, title: string): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, operation, req }) => {
    const user = req.user?.collection === 'users' ? String(req.user.email ?? req.user.id) : ''
    if (!user) return doc
    const changed =
      operation === 'update'
        ? Object.keys(doc).filter((k) => !SKIP.has(k) && JSON.stringify(doc[k]) !== JSON.stringify(previousDoc?.[k]))
        : []
    if (operation === 'update' && !changed.length) return doc
    try {
      await req.payload.create({
        // Its own transaction: a failed log line must never undo the user's change.
        collection: 'activity-log', overrideAccess: true, depth: 0,
        data: { user, action: operation === 'create' ? 'created' : 'changed', collectionName: title, docId: String(doc.id), summary: `${title}: ${label(doc)}`, fields: changed.join(', ').slice(0, 500) } as never,
      })
    } catch (err) {
      req.payload.logger.error({ name: (err as Error)?.name, slug }, 'activity not logged')
    }
    return doc
  }
}
