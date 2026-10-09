import { randomBytes } from 'node:crypto'

import type { CollectionConfig, PayloadHandler } from 'payload'

import { SITE_URL } from '../lib/site.ts'
import { emailsIn } from '../lib/trade-docs.ts'
import { isStaff } from './access.ts'
import { jsonBody, notJson } from './SupplierOrders.ts'
import { loadSeller } from './TradeSettings.ts'

// Client portal logins. Separate from staff accounts: a portal user belongs to one client and only
// ever sees that client's own sales (src/collections/Portal.ts). Accounts are made by staff with
// "Invite to the client portal" on a client; the client sets the password from the emailed link.
const site = () => SITE_URL.replace(/\/$/, '')

export const PortalUsers: CollectionConfig = {
  slug: 'portal-users',
  labels: { singular: 'Client portal login', plural: 'Client portal logins' },
  admin: { group: 'Settings', useAsTitle: 'email', defaultColumns: ['email', 'name', 'client', 'active'] },
  auth: {
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 7 * 24 * 3600,
    forgotPassword: {
      expiration: 3 * 24 * 3600 * 1000,
      generateEmailSubject: () => 'Your client portal: set your password',
      generateEmailHTML: (args) => {
        const token = String(args?.token ?? '')
        const link = `${site()}/portal/reset/?token=${encodeURIComponent(token)}`
        return `<p>Hello,</p><p>Use this link to set the password of your client portal, where you can see your proforma invoices and invoices, confirm orders, send payment slips and follow your shipments:</p><p><a href="${link}">${link}</a></p><p>The link works for 3 days. If you did not expect this email, you can ignore it.</p>`
      },
    },
  },
  access: {
    read: ({ req }) => isStaff(req) || (req.user?.collection === 'portal-users' ? { id: { equals: req.user.id } } : false),
    create: ({ req }) => isStaff(req),
    update: ({ req, id }) => isStaff(req) || (req.user?.collection === 'portal-users' && String(id) === String(req.user.id)),
    delete: () => false,
    admin: () => false,
  },
  fields: [
    { name: 'name', type: 'text' },
    { name: 'client', type: 'relationship', relationTo: 'clients', required: true, access: { update: ({ req }) => isStaff(req) } },
    { name: 'active', type: 'checkbox', defaultValue: true, label: 'Can log in', access: { update: ({ req }) => isStaff(req) } },
  ],
  hooks: {
    // A switched-off login cannot enter.
    beforeLogin: [
      ({ user }) => {
        if (user && (user as { active?: boolean }).active === false) throw new Error('This login is switched off')
        return user
      },
    ],
  },
}

// POST /api/clients/:id/portal-invite { email }: makes the portal login (if new) and emails the
// set-password link. Staff only.
export const portalInvite: PayloadHandler = async (req) => {
  if (!isStaff(req)) return Response.json({ error: 'Not allowed' }, { status: 403 })
  const body = await jsonBody<{ email?: string }>(req)
  if (!body) return notJson()
  const email = emailsIn(body.email)[0]
  if (!email) return Response.json({ error: 'Type one email address' }, { status: 400 })
  if (!process.env.SMTP_HOST && process.env.NODE_ENV === 'production') return Response.json({ error: 'Email is not set up on this server' }, { status: 503 })
  const clientId = String(req.routeParams?.id)
  const found = await req.payload.find({ collection: 'portal-users', where: { email: { equals: email } }, limit: 1, depth: 0, overrideAccess: true, req })
  const existing = found.docs[0] as unknown as { id: number; client: number | { id: number } } | undefined
  if (existing && String(typeof existing.client === 'object' ? existing.client.id : existing.client) !== clientId) {
    return Response.json({ error: 'This email already has a portal login for another client' }, { status: 409 })
  }
  if (!existing) {
    await req.payload.create({
      collection: 'portal-users', overrideAccess: true, depth: 0, req,
      data: { email, client: Number(clientId) || clientId, password: randomBytes(24).toString('base64url'), active: true } as never,
    })
  }
  const seller = await loadSeller(req.payload, req)
  await req.payload.forgotPassword({ collection: 'portal-users', data: { email }, req, disableEmail: false })
  req.payload.logger.info(`portal invite for client ${clientId} by ${String(req.user?.email)} (${seller.companyName})`)
  return Response.json({ ok: true, email })
}
