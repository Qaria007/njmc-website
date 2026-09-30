import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_order_matches_status" AS ENUM('new', 'suppliers contacted', 'quoted', 'won', 'lost');
  CREATE TABLE "order_matches_lines_matches" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"supplier_id" integer,
  	"product_id" integer,
  	"matched_on" varchar,
  	"documents" varchar,
  	"certificates" varchar
  );
  
  CREATE TABLE "order_matches_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"requested" varchar,
  	"cas" varchar,
  	"grade" varchar,
  	"quantity" varchar,
  	"supplier_count" numeric
  );
  
  CREATE TABLE "order_matches" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"customer" varchar,
  	"status" "enum_order_matches_status" DEFAULT 'new',
  	"order_file_id" integer,
  	"typed_materials" varchar,
  	"rematch" boolean DEFAULT true,
  	"matched_at" timestamp(3) with time zone,
  	"read_note" varchar,
  	"results" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "order_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"note" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "order_matches_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "order_files_id" integer;
  ALTER TABLE "order_matches_lines_matches" ADD CONSTRAINT "order_matches_lines_matches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_matches_lines_matches" ADD CONSTRAINT "order_matches_lines_matches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "order_matches_lines_matches" ADD CONSTRAINT "order_matches_lines_matches_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."order_matches_lines"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "order_matches_lines" ADD CONSTRAINT "order_matches_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."order_matches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "order_matches" ADD CONSTRAINT "order_matches_order_file_id_order_files_id_fk" FOREIGN KEY ("order_file_id") REFERENCES "public"."order_files"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "order_matches_lines_matches_order_idx" ON "order_matches_lines_matches" USING btree ("_order");
  CREATE INDEX "order_matches_lines_matches_parent_id_idx" ON "order_matches_lines_matches" USING btree ("_parent_id");
  CREATE INDEX "order_matches_lines_matches_supplier_idx" ON "order_matches_lines_matches" USING btree ("supplier_id");
  CREATE INDEX "order_matches_lines_matches_product_idx" ON "order_matches_lines_matches" USING btree ("product_id");
  CREATE INDEX "order_matches_lines_order_idx" ON "order_matches_lines" USING btree ("_order");
  CREATE INDEX "order_matches_lines_parent_id_idx" ON "order_matches_lines" USING btree ("_parent_id");
  CREATE INDEX "order_matches_order_file_idx" ON "order_matches" USING btree ("order_file_id");
  CREATE INDEX "order_matches_updated_at_idx" ON "order_matches" USING btree ("updated_at");
  CREATE INDEX "order_matches_created_at_idx" ON "order_matches" USING btree ("created_at");
  CREATE INDEX "order_files_updated_at_idx" ON "order_files" USING btree ("updated_at");
  CREATE INDEX "order_files_created_at_idx" ON "order_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "order_files_filename_idx" ON "order_files" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_order_matches_fk" FOREIGN KEY ("order_matches_id") REFERENCES "public"."order_matches"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_order_files_fk" FOREIGN KEY ("order_files_id") REFERENCES "public"."order_files"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_order_matches_id_idx" ON "payload_locked_documents_rels" USING btree ("order_matches_id");
  CREATE INDEX "payload_locked_documents_rels_order_files_id_idx" ON "payload_locked_documents_rels" USING btree ("order_files_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "order_matches_lines_matches" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "order_matches_lines" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "order_matches" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "order_files" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "order_matches_lines_matches" CASCADE;
  DROP TABLE "order_matches_lines" CASCADE;
  DROP TABLE "order_matches" CASCADE;
  DROP TABLE "order_files" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_order_matches_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_order_files_fk";
  
  DROP INDEX "payload_locked_documents_rels_order_matches_id_idx";
  DROP INDEX "payload_locked_documents_rels_order_files_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "order_matches_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "order_files_id";
  DROP TYPE "public"."enum_order_matches_status";`)
}
