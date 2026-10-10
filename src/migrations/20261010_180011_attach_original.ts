import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies_licences" ALTER COLUMN "print_on_certificate" SET DEFAULT false;
  ALTER TABLE "trader_coas" ADD COLUMN "attach_original" boolean DEFAULT true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies_licences" ALTER COLUMN "print_on_certificate" SET DEFAULT true;
  ALTER TABLE "trader_coas" DROP COLUMN "attach_original";`)
}
