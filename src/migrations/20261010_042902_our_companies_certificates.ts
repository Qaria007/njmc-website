import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trader_coas_product_type" AS ENUM('api', 'excipient', 'finished', 'device', 'chemical', 'other');
  CREATE TYPE "public"."enum_trader_coas_expiry_kind" AS ENUM('expiry', 'retest');
  CREATE TYPE "public"."enum_trader_coas_handling" AS ENUM('unchanged', 'repacked');
  CREATE TYPE "public"."enum_trader_coas_results_source" AS ENUM('manufacturer', 'lab');
  CREATE TYPE "public"."enum_issuing_companies_licences_covers" AS ENUM('api', 'excipient', 'finished', 'device', 'chemical', 'other');
  CREATE TYPE "public"."enum_issuing_companies_licences_kind" AS ENUM('drug-distribution', 'pharma-import-export', 'device-distribution', 'gdp-gmp', 'chemicals', 'business', 'other');
  CREATE TYPE "public"."enum_issuing_companies_relation" AS ENUM('own', 'partner');
  CREATE TABLE "trader_coas_tests" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"test" varchar NOT NULL,
  	"criteria" varchar,
  	"result" varchar,
  	"method" varchar
  );
  
  CREATE TABLE "trader_coas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"source_file_id" integer,
  	"issuer_id" integer,
  	"number" varchar,
  	"issue_date" timestamp(3) with time zone,
  	"client_id" integer,
  	"customer_name" varchar,
  	"customer_ref" varchar,
  	"quantity_supplied" varchar,
  	"product_name" varchar NOT NULL,
  	"product_type" "enum_trader_coas_product_type",
  	"grade" varchar,
  	"cas_no" varchar,
  	"specification" varchar,
  	"batch_no" varchar,
  	"batch_size" varchar,
  	"mfg_date" varchar,
  	"expiry_date" varchar,
  	"expiry_kind" "enum_trader_coas_expiry_kind" DEFAULT 'expiry',
  	"packaging" varchar,
  	"storage" varchar,
  	"handling" "enum_trader_coas_handling",
  	"manufacturer_name" varchar,
  	"manufacturer_phone" varchar,
  	"manufacturer_address" varchar,
  	"original_coa_no" varchar,
  	"original_coa_date" varchar,
  	"supplier_issued_by" varchar,
  	"results_source" "enum_trader_coas_results_source" DEFAULT 'manufacturer',
  	"lab_name" varchar,
  	"lab_report_no" varchar,
  	"lab_report_date" varchar,
  	"lab_address" varchar,
  	"lab_phone" varchar,
  	"conclusion" varchar,
  	"remarks" varchar,
  	"spec_notes" varchar,
  	"reading_notes" varchar,
  	"issued_at" timestamp(3) with time zone,
  	"issued_by" varchar,
  	"issued_sha256" varchar,
  	"issued_file" varchar,
  	"reading" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "issuing_companies_licences_covers" (
  	"order" integer NOT NULL,
  	"parent_id" varchar NOT NULL,
  	"value" "enum_issuing_companies_licences_covers",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "issuing_companies_licences" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_issuing_companies_licences_kind" NOT NULL,
  	"number" varchar NOT NULL,
  	"authority" varchar,
  	"valid_from" timestamp(3) with time zone,
  	"valid_until" timestamp(3) with time zone,
  	"print_on_certificate" boolean DEFAULT true,
  	"scan_id" integer
  );
  
  CREATE TABLE "issuing_companies" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"company_name" varchar NOT NULL,
  	"relation" "enum_issuing_companies_relation" DEFAULT 'own',
  	"prefix" varchar,
  	"logo_id" integer,
  	"registration_no" varchar,
  	"country" varchar,
  	"address" varchar,
  	"phone" varchar,
  	"email" varchar,
  	"website" varchar,
  	"signatory_name" varchar,
  	"signatory_title" varchar,
  	"bank_details" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "buyer_documents" ADD COLUMN "seller_company_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trader_coas_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "issuing_companies_id" integer;
  ALTER TABLE "trader_coas_tests" ADD CONSTRAINT "trader_coas_tests_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."trader_coas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trader_coas" ADD CONSTRAINT "trader_coas_source_file_id_trade_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."trade_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trader_coas" ADD CONSTRAINT "trader_coas_issuer_id_issuing_companies_id_fk" FOREIGN KEY ("issuer_id") REFERENCES "public"."issuing_companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trader_coas" ADD CONSTRAINT "trader_coas_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "issuing_companies_licences_covers" ADD CONSTRAINT "issuing_companies_licences_covers_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."issuing_companies_licences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "issuing_companies_licences" ADD CONSTRAINT "issuing_companies_licences_scan_id_trade_files_id_fk" FOREIGN KEY ("scan_id") REFERENCES "public"."trade_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "issuing_companies_licences" ADD CONSTRAINT "issuing_companies_licences_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."issuing_companies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "issuing_companies" ADD CONSTRAINT "issuing_companies_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "trader_coas_tests_order_idx" ON "trader_coas_tests" USING btree ("_order");
  CREATE INDEX "trader_coas_tests_parent_id_idx" ON "trader_coas_tests" USING btree ("_parent_id");
  CREATE INDEX "trader_coas_source_file_idx" ON "trader_coas" USING btree ("source_file_id");
  CREATE INDEX "trader_coas_issuer_idx" ON "trader_coas" USING btree ("issuer_id");
  CREATE UNIQUE INDEX "trader_coas_number_idx" ON "trader_coas" USING btree ("number");
  CREATE INDEX "trader_coas_client_idx" ON "trader_coas" USING btree ("client_id");
  CREATE INDEX "trader_coas_updated_at_idx" ON "trader_coas" USING btree ("updated_at");
  CREATE INDEX "trader_coas_created_at_idx" ON "trader_coas" USING btree ("created_at");
  CREATE INDEX "issuing_companies_licences_covers_order_idx" ON "issuing_companies_licences_covers" USING btree ("order");
  CREATE INDEX "issuing_companies_licences_covers_parent_idx" ON "issuing_companies_licences_covers" USING btree ("parent_id");
  CREATE INDEX "issuing_companies_licences_order_idx" ON "issuing_companies_licences" USING btree ("_order");
  CREATE INDEX "issuing_companies_licences_parent_id_idx" ON "issuing_companies_licences" USING btree ("_parent_id");
  CREATE INDEX "issuing_companies_licences_scan_idx" ON "issuing_companies_licences" USING btree ("scan_id");
  CREATE INDEX "issuing_companies_logo_idx" ON "issuing_companies" USING btree ("logo_id");
  CREATE INDEX "issuing_companies_updated_at_idx" ON "issuing_companies" USING btree ("updated_at");
  CREATE INDEX "issuing_companies_created_at_idx" ON "issuing_companies" USING btree ("created_at");
  ALTER TABLE "buyer_documents" ADD CONSTRAINT "buyer_documents_seller_company_id_issuing_companies_id_fk" FOREIGN KEY ("seller_company_id") REFERENCES "public"."issuing_companies"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trader_coas_fk" FOREIGN KEY ("trader_coas_id") REFERENCES "public"."trader_coas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_issuing_companies_fk" FOREIGN KEY ("issuing_companies_id") REFERENCES "public"."issuing_companies"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "buyer_documents_seller_company_idx" ON "buyer_documents" USING btree ("seller_company_id");
  CREATE INDEX "payload_locked_documents_rels_trader_coas_id_idx" ON "payload_locked_documents_rels" USING btree ("trader_coas_id");
  CREATE INDEX "payload_locked_documents_rels_issuing_companies_id_idx" ON "payload_locked_documents_rels" USING btree ("issuing_companies_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trader_coas_tests" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trader_coas" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "issuing_companies_licences_covers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "issuing_companies_licences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "issuing_companies" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "trader_coas_tests" CASCADE;
  DROP TABLE "trader_coas" CASCADE;
  DROP TABLE "issuing_companies_licences_covers" CASCADE;
  DROP TABLE "issuing_companies_licences" CASCADE;
  DROP TABLE "issuing_companies" CASCADE;
  ALTER TABLE "buyer_documents" DROP CONSTRAINT IF EXISTS "buyer_documents_seller_company_id_issuing_companies_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_trader_coas_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_issuing_companies_fk";
  
  DROP INDEX IF EXISTS "buyer_documents_seller_company_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_trader_coas_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_issuing_companies_id_idx";
  ALTER TABLE "buyer_documents" DROP COLUMN "seller_company_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trader_coas_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "issuing_companies_id";
  DROP TYPE "public"."enum_trader_coas_product_type";
  DROP TYPE "public"."enum_trader_coas_expiry_kind";
  DROP TYPE "public"."enum_trader_coas_handling";
  DROP TYPE "public"."enum_trader_coas_results_source";
  DROP TYPE "public"."enum_issuing_companies_licences_covers";
  DROP TYPE "public"."enum_issuing_companies_licences_kind";
  DROP TYPE "public"."enum_issuing_companies_relation";`)
}
