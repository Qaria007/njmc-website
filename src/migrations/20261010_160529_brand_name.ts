import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies" ADD COLUMN "brand_name" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "brand_name" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies" DROP COLUMN "brand_name";
  ALTER TABLE "trade_settings" DROP COLUMN "brand_name";`)
}
