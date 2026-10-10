import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_issuing_companies_licences_kind" ADD VALUE 'export-trading' BEFORE 'business';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "issuing_companies_licences" ALTER COLUMN "kind" SET DATA TYPE text;
  DROP TYPE "public"."enum_issuing_companies_licences_kind";
  CREATE TYPE "public"."enum_issuing_companies_licences_kind" AS ENUM('drug-distribution', 'pharma-import-export', 'device-distribution', 'gdp-gmp', 'chemicals', 'business', 'other');
  ALTER TABLE "issuing_companies_licences" ALTER COLUMN "kind" SET DATA TYPE "public"."enum_issuing_companies_licences_kind" USING "kind"::"public"."enum_issuing_companies_licences_kind";`)
}
