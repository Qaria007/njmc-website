import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_products_grades" AS ENUM('EP', 'USP', 'BP', 'JP', 'ChP', 'IP', 'In-house');
  CREATE TYPE "public"."enum_products_category" AS ENUM('api', 'excipient', 'colour');
  CREATE TYPE "public"."enum_suppliers_supplies" AS ENUM('api', 'intermediate', 'excipient', 'colour', 'device', 'consumable', 'other');
  CREATE TYPE "public"."enum_suppliers_status" AS ENUM('new', 'contacted', 'samples', 'qualified', 'approved', 'on-hold', 'rejected');
  CREATE TYPE "public"."enum_supplier_certificates_type" AS ENUM('cn-gmp', 'cn-dml', 'eu-gmp', 'us-fda', 'who-gmp', 'cep', 'us-dmf', 'wc', 'ipec-gmp', 'iso-9001', 'iso-13485', 'iso-22000', 'fssc-22000', 'business-licence', 'other');
  CREATE TABLE "products_grades" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_products_grades",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "products_sources" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"supplier_id" integer NOT NULL,
  	"documents" varchar,
  	"market_status" varchar,
  	"details" varchar
  );
  
  CREATE TABLE "products" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"published" boolean DEFAULT false,
  	"category" "enum_products_category" NOT NULL,
  	"product_class" varchar,
  	"other_names" varchar,
  	"cas" varchar,
  	"ci_number" varchar,
  	"internal_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "suppliers_supplies" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_suppliers_supplies",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "suppliers" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"name_local" varchar,
  	"country" varchar NOT NULL,
  	"city" varchar,
  	"address" varchar,
  	"website" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"status" "enum_suppliers_status" DEFAULT 'new',
  	"source" varchar,
  	"documents_folder" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "supplier_certificates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"supplier_id" integer NOT NULL,
  	"type" "enum_supplier_certificates_type" NOT NULL,
  	"number" varchar,
  	"issuer" varchar,
  	"scope" varchar,
  	"issued" timestamp(3) with time zone,
  	"valid_until" timestamp(3) with time zone,
  	"source_file" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "products_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "suppliers_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "supplier_certificates_id" integer;
  ALTER TABLE "products_grades" ADD CONSTRAINT "products_grades_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "products_sources" ADD CONSTRAINT "products_sources_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "products_sources" ADD CONSTRAINT "products_sources_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "suppliers_supplies" ADD CONSTRAINT "suppliers_supplies_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "supplier_certificates" ADD CONSTRAINT "supplier_certificates_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "products_grades_order_idx" ON "products_grades" USING btree ("order");
  CREATE INDEX "products_grades_parent_idx" ON "products_grades" USING btree ("parent_id");
  CREATE INDEX "products_sources_order_idx" ON "products_sources" USING btree ("_order");
  CREATE INDEX "products_sources_parent_id_idx" ON "products_sources" USING btree ("_parent_id");
  CREATE INDEX "products_sources_supplier_idx" ON "products_sources" USING btree ("supplier_id");
  CREATE UNIQUE INDEX "products_slug_idx" ON "products" USING btree ("slug");
  CREATE INDEX "products_updated_at_idx" ON "products" USING btree ("updated_at");
  CREATE INDEX "products_created_at_idx" ON "products" USING btree ("created_at");
  CREATE INDEX "suppliers_supplies_order_idx" ON "suppliers_supplies" USING btree ("order");
  CREATE INDEX "suppliers_supplies_parent_idx" ON "suppliers_supplies" USING btree ("parent_id");
  CREATE UNIQUE INDEX "suppliers_name_idx" ON "suppliers" USING btree ("name");
  CREATE INDEX "suppliers_updated_at_idx" ON "suppliers" USING btree ("updated_at");
  CREATE INDEX "suppliers_created_at_idx" ON "suppliers" USING btree ("created_at");
  CREATE INDEX "supplier_certificates_supplier_idx" ON "supplier_certificates" USING btree ("supplier_id");
  CREATE INDEX "supplier_certificates_updated_at_idx" ON "supplier_certificates" USING btree ("updated_at");
  CREATE INDEX "supplier_certificates_created_at_idx" ON "supplier_certificates" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_products_fk" FOREIGN KEY ("products_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_suppliers_fk" FOREIGN KEY ("suppliers_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_supplier_certificates_fk" FOREIGN KEY ("supplier_certificates_id") REFERENCES "public"."supplier_certificates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_products_id_idx" ON "payload_locked_documents_rels" USING btree ("products_id");
  CREATE INDEX "payload_locked_documents_rels_suppliers_id_idx" ON "payload_locked_documents_rels" USING btree ("suppliers_id");
  CREATE INDEX "payload_locked_documents_rels_supplier_certificates_id_idx" ON "payload_locked_documents_rels" USING btree ("supplier_certificates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "products_grades" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "products" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "suppliers_supplies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "suppliers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "supplier_certificates" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "products_grades" CASCADE;
  DROP TABLE "products_sources" CASCADE;
  DROP TABLE "products" CASCADE;
  DROP TABLE "suppliers_supplies" CASCADE;
  DROP TABLE "suppliers" CASCADE;
  DROP TABLE "supplier_certificates" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_products_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_suppliers_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_supplier_certificates_fk";
  
  DROP INDEX "payload_locked_documents_rels_products_id_idx";
  DROP INDEX "payload_locked_documents_rels_suppliers_id_idx";
  DROP INDEX "payload_locked_documents_rels_supplier_certificates_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "products_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "suppliers_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "supplier_certificates_id";
  DROP TYPE "public"."enum_products_grades";
  DROP TYPE "public"."enum_products_category";
  DROP TYPE "public"."enum_suppliers_supplies";
  DROP TYPE "public"."enum_suppliers_status";
  DROP TYPE "public"."enum_supplier_certificates_type";`)
}
