import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trade_settings_rate_mode" AS ENUM('auto', 'manual');
  CREATE TYPE "public"."enum_trade_settings_ai_model" AS ENUM('claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5');
  ALTER TABLE "trade_settings" ADD COLUMN "rate_mode" "enum_trade_settings_rate_mode" DEFAULT 'auto';
  ALTER TABLE "trade_settings" ADD COLUMN "rates_date" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "rates_source" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "rates_checked_at" timestamp(3) with time zone;
  ALTER TABLE "trade_settings" ADD COLUMN "ai_mode" boolean DEFAULT false;
  ALTER TABLE "trade_settings" ADD COLUMN "ai_model" "enum_trade_settings_ai_model" DEFAULT 'claude-opus-5-5';
  ALTER TABLE "trade_settings" ADD COLUMN "new_ai_key" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "ai_key_hint" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "remove_ai_key" boolean DEFAULT false;
  ALTER TABLE "trade_settings" ADD COLUMN "ai_key_sealed" varchar;
  UPDATE "trade_settings" SET "rate_mode" = 'manual' WHERE "cny_per_usd" IS NOT NULL OR "usd_per_eur" IS NOT NULL;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trade_settings" DROP COLUMN "rate_mode";
  ALTER TABLE "trade_settings" DROP COLUMN "rates_date";
  ALTER TABLE "trade_settings" DROP COLUMN "rates_source";
  ALTER TABLE "trade_settings" DROP COLUMN "rates_checked_at";
  ALTER TABLE "trade_settings" DROP COLUMN "ai_mode";
  ALTER TABLE "trade_settings" DROP COLUMN "ai_model";
  ALTER TABLE "trade_settings" DROP COLUMN "new_ai_key";
  ALTER TABLE "trade_settings" DROP COLUMN "ai_key_hint";
  ALTER TABLE "trade_settings" DROP COLUMN "remove_ai_key";
  ALTER TABLE "trade_settings" DROP COLUMN "ai_key_sealed";
  DROP TYPE "public"."enum_trade_settings_rate_mode";
  DROP TYPE "public"."enum_trade_settings_ai_model";`)
}
