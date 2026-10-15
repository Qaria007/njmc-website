import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_suppliers_category" AS ENUM('pharma', 'imaging', 'monitoring', 'life-support', 'surgical', 'or-equipment', 'consumables', 'infusion', 'wound-care', 'laboratory', 'sterilization', 'furniture', 'rehabilitation', 'orthopaedic', 'cardiovascular', 'dental', 'ophthalmic', 'specialties', 'aesthetics', 'tcm', 'components', 'hospital-build', 'services', 'emergency', 'veterinary', 'nutrition');
  CREATE TABLE "suppliers_category" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_suppliers_category",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "visits_pages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"path" varchar NOT NULL,
  	"at" timestamp(3) with time zone
  );
  
  CREATE TABLE "visits" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"summary" varchar,
  	"day" varchar NOT NULL,
  	"visitor" varchar NOT NULL,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"last_at" timestamp(3) with time zone NOT NULL,
  	"country" varchar,
  	"country_code" varchar,
  	"city" varchar,
  	"network" varchar,
  	"source" varchar,
  	"device" varchar,
  	"lang" varchar,
  	"landing" varchar,
  	"page_count" numeric DEFAULT 1 NOT NULL,
  	"contact_clicks" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "visits_id" integer;
  ALTER TABLE "suppliers_category" ADD CONSTRAINT "suppliers_category_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "visits_pages" ADD CONSTRAINT "visits_pages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "suppliers_category_order_idx" ON "suppliers_category" USING btree ("order");
  CREATE INDEX "suppliers_category_parent_idx" ON "suppliers_category" USING btree ("parent_id");
  CREATE INDEX "suppliers_category_value_idx" ON "suppliers_category" USING btree ("value");
  CREATE INDEX "visits_pages_order_idx" ON "visits_pages" USING btree ("_order");
  CREATE INDEX "visits_pages_parent_id_idx" ON "visits_pages" USING btree ("_parent_id");
  CREATE INDEX "visits_day_idx" ON "visits" USING btree ("day");
  CREATE INDEX "visits_visitor_idx" ON "visits" USING btree ("visitor");
  CREATE INDEX "visits_started_at_idx" ON "visits" USING btree ("started_at");
  CREATE INDEX "visits_country_idx" ON "visits" USING btree ("country");
  CREATE INDEX "visits_landing_idx" ON "visits" USING btree ("landing");
  CREATE INDEX "visits_updated_at_idx" ON "visits" USING btree ("updated_at");
  CREATE INDEX "visits_created_at_idx" ON "visits" USING btree ("created_at");
  CREATE UNIQUE INDEX "day_visitor_idx" ON "visits" USING btree ("day","visitor");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_visits_fk" FOREIGN KEY ("visits_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_visits_id_idx" ON "payload_locked_documents_rels" USING btree ("visits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "suppliers_category" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "visits_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "visits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "suppliers_category" CASCADE;
  DROP TABLE "visits_pages" CASCADE;
  DROP TABLE "visits" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_visits_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_visits_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "visits_id";
  DROP TYPE "public"."enum_suppliers_category";`)
}
