import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies" ADD COLUMN "stamp_id" integer;
  ALTER TABLE "issuing_companies" ADD CONSTRAINT "issuing_companies_stamp_id_media_id_fk" FOREIGN KEY ("stamp_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "issuing_companies_stamp_idx" ON "issuing_companies" USING btree ("stamp_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies" DROP CONSTRAINT "issuing_companies_stamp_id_media_id_fk";
  
  DROP INDEX "issuing_companies_stamp_idx";
  ALTER TABLE "issuing_companies" DROP COLUMN "stamp_id";`)
}
