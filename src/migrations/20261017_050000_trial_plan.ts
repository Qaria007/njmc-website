import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Free trial plan for network clients (owner, 17 Oct 2026). An enum value cannot be removed in
// Postgres without rebuilding the type, so down only moves trial clients to starter.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TYPE "public"."enum_network_clients_plan" ADD VALUE IF NOT EXISTS 'trial' BEFORE 'starter';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`UPDATE "network_clients" SET "plan" = 'starter' WHERE "plan" = 'trial';`)
}
