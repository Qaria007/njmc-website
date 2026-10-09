import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { AccountsOverview } from './collections/AccountsOverview.ts'
import { ActivityLog, logActivity } from './collections/ActivityLog.ts'
import { BuyerDocuments } from './collections/BuyerDocuments.ts'
import { Clients } from './collections/Clients.ts'
import { deskEndpoints } from './collections/Desk.ts'
import { portalEndpoints } from './collections/Portal.ts'
import { PortalUsers } from './collections/PortalUsers.ts'
import { InboxMessages, startInboxReader } from './collections/Inbox.ts'
import { Leads } from './collections/Leads.ts'
import { Media } from './collections/Media.ts'
import { OrderFiles } from './collections/OrderFiles.ts'
import { OrderMatches } from './collections/OrderMatches.ts'
import { Payments } from './collections/Payments.ts'
import { Products } from './collections/Products.ts'
import { SupplierCertificates } from './collections/SupplierCertificates.ts'
import { SupplierOrders } from './collections/SupplierOrders.ts'
import { Suppliers } from './collections/Suppliers.ts'
import { TradeFiles } from './collections/TradeFiles.ts'
import { TradeSettings } from './collections/TradeSettings.ts'
import { Users } from './collections/Users.ts'
import { migrations } from './migrations/index.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  serverURL: process.env.NEXT_PUBLIC_SERVER_URL || '',
  // The login cookie is accepted only from the site itself (and the local dev address), never from
  // another origin, whatever NEXT_PUBLIC_SERVER_URL was at build time.
  csrf: [...new Set(['https://njmcmedicsupp.com', 'https://www.njmcmedicsupp.com', process.env.NEXT_PUBLIC_SERVER_URL || ''].filter(Boolean))],
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ` | ${process.env.ADMIN_TITLE || 'NJMC admin'}` },
    importMap: { baseDir: path.resolve(dirname) },
    components: { beforeDashboard: ['/components/admin/HomeDashboard#HomeDashboard'] },
  },
  // Order of the menu: the daily work first.
  collections: [OrderMatches, Clients, SupplierOrders, BuyerDocuments, InboxMessages, TradeFiles, Payments, Products, Suppliers, SupplierCertificates, OrderFiles, Leads, Media, Users, PortalUsers, ActivityLog].map(
    (c) => (c.slug === 'activity-log' || c.slug === 'media' ? c : { ...c, hooks: { ...c.hooks, afterChange: [...(c.hooks?.afterChange ?? []), logActivity(c.slug as never, String((c.labels?.singular as string) ?? c.slug))] } }),
  ),
  endpoints: [...deskEndpoints, ...portalEndpoints],
  onInit: async (payload) => startInboxReader(payload),
  globals: [TradeSettings, AccountsOverview],
  localization: {
    locales: [
      { code: 'en', label: 'English' },
      { code: 'ar', label: 'العربية', rtl: true },
    ],
    defaultLocale: 'en',
    fallback: false,
  },
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI || '' },
    // Schema changes ship as migrations (src/migrations). Payload runs pending ones when it
    // first initialises in production (first /admin or /api request; the deploy step makes one).
    push: false,
    prodMigrations: migrations,
  }),
  // Google Workspace SMTP relay: accepts mail from this server's IP, no password (checked
  // 27 Sep 2026). Without SMTP_HOST (local dev) Payload logs mail to the console instead.
  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.MAIL_FROM || 'sale@njmcmedicsupp.com',
        defaultFromName: process.env.MAIL_FROM_NAME || 'NJMC Medical Supplies website',
        transportOptions: {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: false,
          requireTLS: true,
          name: 'njmcmedicsupp.com',
        },
      })
    : undefined,
  // 10 MB per upload (images and order files).
  upload: { limits: { fileSize: 10_000_000 } },
  sharp,
})
