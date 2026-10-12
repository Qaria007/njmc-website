import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_page_views_kind" AS ENUM('view', 'whatsapp', 'email', 'phone');
  CREATE TABLE "page_views" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" varchar NOT NULL,
  	"kind" "enum_page_views_kind" DEFAULT 'view' NOT NULL,
  	"path" varchar NOT NULL,
  	"lang" varchar,
  	"source" varchar,
  	"device" varchar,
  	"count" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "order_matches" ADD COLUMN "file_reading" jsonb;
  ALTER TABLE "order_matches" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "order_files" ADD COLUMN "deleted_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "page_views_id" integer;
  CREATE INDEX "page_views_day_idx" ON "page_views" USING btree ("day");
  CREATE INDEX "page_views_kind_idx" ON "page_views" USING btree ("kind");
  CREATE INDEX "page_views_path_idx" ON "page_views" USING btree ("path");
  CREATE INDEX "page_views_updated_at_idx" ON "page_views" USING btree ("updated_at");
  CREATE INDEX "page_views_created_at_idx" ON "page_views" USING btree ("created_at");
  CREATE UNIQUE INDEX "day_kind_path_lang_source_device_idx" ON "page_views" USING btree ("day","kind","path","lang","source","device");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_page_views_fk" FOREIGN KEY ("page_views_id") REFERENCES "public"."page_views"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "order_matches_deleted_at_idx" ON "order_matches" USING btree ("deleted_at");
  CREATE INDEX "order_files_deleted_at_idx" ON "order_files" USING btree ("deleted_at");
  CREATE INDEX "payload_locked_documents_rels_page_views_id_idx" ON "payload_locked_documents_rels" USING btree ("page_views_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "page_views" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "page_views" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_page_views_fk";
  
  DROP INDEX "order_matches_deleted_at_idx";
  DROP INDEX "order_files_deleted_at_idx";
  DROP INDEX "payload_locked_documents_rels_page_views_id_idx";
  ALTER TABLE "order_matches" DROP COLUMN "file_reading";
  ALTER TABLE "order_matches" DROP COLUMN "deleted_at";
  ALTER TABLE "order_files" DROP COLUMN "deleted_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "page_views_id";
  DROP TYPE "public"."enum_page_views_kind";`)
}
