import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { BuyerDocuments } from './collections/BuyerDocuments.ts'
import { Leads } from './collections/Leads.ts'
import { Media } from './collections/Media.ts'
import { OrderFiles } from './collections/OrderFiles.ts'
import { OrderMatches } from './collections/OrderMatches.ts'
import { Products } from './collections/Products.ts'
import { SupplierCertificates } from './collections/SupplierCertificates.ts'
import { SupplierOrders } from './collections/SupplierOrders.ts'
import { Suppliers } from './collections/Suppliers.ts'
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
    meta: { titleSuffix: ' | NJMC admin' },
    importMap: { baseDir: path.resolve(dirname) },
  },
  collections: [Users, Media, Leads, Products, Suppliers, SupplierCertificates, OrderMatches, OrderFiles, SupplierOrders, BuyerDocuments],
  globals: [TradeSettings],
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
        defaultFromName: 'NJMC Medical Supplies website',
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
