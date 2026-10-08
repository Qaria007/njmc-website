import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_suppliers_rating" AS ENUM('5', '4', '3', '2', '1');
  ALTER TYPE "public"."enum_trade_settings_ai_model" ADD VALUE 'gpt-5';
  ALTER TYPE "public"."enum_trade_settings_ai_model" ADD VALUE 'gpt-5-mini';
  ALTER TABLE "suppliers" ADD COLUMN "rating" "enum_suppliers_rating";
  ALTER TABLE "suppliers" ADD COLUMN "problems" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trade_settings" ALTER COLUMN "ai_model" SET DATA TYPE text;
  ALTER TABLE "trade_settings" ALTER COLUMN "ai_model" SET DEFAULT 'claude-opus-5-5'::text;
  DROP TYPE "public"."enum_trade_settings_ai_model";
  CREATE TYPE "public"."enum_trade_settings_ai_model" AS ENUM('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5');
  ALTER TABLE "trade_settings" ALTER COLUMN "ai_model" SET DEFAULT 'claude-opus-5-5'::"public"."enum_trade_settings_ai_model";
  ALTER TABLE "trade_settings" ALTER COLUMN "ai_model" SET DATA TYPE "public"."enum_trade_settings_ai_model" USING "ai_model"::"public"."enum_trade_settings_ai_model";
  ALTER TABLE "suppliers" DROP COLUMN "rating";
  ALTER TABLE "suppliers" DROP COLUMN "problems";
  DROP TYPE "public"."enum_suppliers_rating";`)
}
