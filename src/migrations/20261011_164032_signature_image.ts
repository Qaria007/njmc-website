import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies" ADD COLUMN "signature_id" integer;
  ALTER TABLE "issuing_companies" ADD CONSTRAINT "issuing_companies_signature_id_media_id_fk" FOREIGN KEY ("signature_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "issuing_companies_signature_idx" ON "issuing_companies" USING btree ("signature_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies" DROP CONSTRAINT "issuing_companies_signature_id_media_id_fk";
  
  DROP INDEX "issuing_companies_signature_idx";
  ALTER TABLE "issuing_companies" DROP COLUMN "signature_id";`)
}
