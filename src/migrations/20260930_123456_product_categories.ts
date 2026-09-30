import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_products_category" ADD VALUE 'intermediate';
  ALTER TYPE "public"."enum_products_category" ADD VALUE 'finished-dosage';
  ALTER TYPE "public"."enum_products_category" ADD VALUE 'extract';
  ALTER TYPE "public"."enum_products_category" ADD VALUE 'device';
  ALTER TYPE "public"."enum_products_category" ADD VALUE 'other';`)
}

// Rolling back needs every product in the new categories moved to api/excipient/colour first
// (never delete them): the enum cast below fails while any row still uses a new value.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products" ALTER COLUMN "category" SET DATA TYPE text;
  DROP TYPE "public"."enum_products_category";
  CREATE TYPE "public"."enum_products_category" AS ENUM('api', 'excipient', 'colour');
  ALTER TABLE "products" ALTER COLUMN "category" SET DATA TYPE "public"."enum_products_category" USING "category"::"public"."enum_products_category";`)
}
