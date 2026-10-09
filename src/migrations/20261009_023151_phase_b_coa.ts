import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trade_files_pt_result" AS ENUM('passed', 'issues found', 'could not be read');
  ALTER TABLE "trade_files" ADD COLUMN "pt_result" "enum_trade_files_pt_result";
  ALTER TABLE "trade_files" ADD COLUMN "pt_checked_at" timestamp(3) with time zone;
  ALTER TABLE "trade_files" ADD COLUMN "pt_report" varchar;
  ALTER TABLE "trade_files" ADD COLUMN "pt_notes" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trade_files" DROP COLUMN "pt_result";
  ALTER TABLE "trade_files" DROP COLUMN "pt_checked_at";
  ALTER TABLE "trade_files" DROP COLUMN "pt_report";
  ALTER TABLE "trade_files" DROP COLUMN "pt_notes";
  DROP TYPE "public"."enum_trade_files_pt_result";`)
}
