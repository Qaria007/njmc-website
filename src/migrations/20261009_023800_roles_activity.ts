import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('owner', 'staff', 'importer');
  CREATE TYPE "public"."enum_activity_log_action" AS ENUM('created', 'changed');
  CREATE TABLE "activity_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user" varchar,
  	"action" "enum_activity_log_action",
  	"collection_name" varchar,
  	"doc_id" varchar,
  	"summary" varchar,
  	"fields" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "buyer_documents" ADD COLUMN "shared_types" varchar;
  ALTER TABLE "users" ADD COLUMN "role" "enum_users_role";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "activity_log_id" integer;
  CREATE INDEX "activity_log_updated_at_idx" ON "activity_log" USING btree ("updated_at");
  CREATE INDEX "activity_log_created_at_idx" ON "activity_log" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_activity_log_fk" FOREIGN KEY ("activity_log_id") REFERENCES "public"."activity_log"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_activity_log_id_idx" ON "payload_locked_documents_rels" USING btree ("activity_log_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "activity_log" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "activity_log" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_activity_log_fk";
  
  DROP INDEX "payload_locked_documents_rels_activity_log_id_idx";
  ALTER TABLE "buyer_documents" DROP COLUMN "shared_types";
  ALTER TABLE "users" DROP COLUMN "role";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "activity_log_id";
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_activity_log_action";`)
}
