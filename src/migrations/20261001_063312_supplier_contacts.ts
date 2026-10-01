import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "suppliers" ADD COLUMN "contact_person" varchar;
  ALTER TABLE "suppliers" ADD COLUMN "wechat" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "suppliers" DROP COLUMN "contact_person";
  ALTER TABLE "suppliers" DROP COLUMN "wechat";`)
}
