import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_supplier_orders_kind" AS ENUM('rfq', 'po');
  CREATE TYPE "public"."enum_supplier_orders_status" AS ENUM('draft', 'sent', 'supplier replied', 'confirmed', 'cancelled');
  CREATE TYPE "public"."enum_supplier_orders_currency" AS ENUM('USD', 'CNY', 'EUR');
  CREATE TYPE "public"."enum_supplier_orders_incoterm" AS ENUM('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP');
  CREATE TYPE "public"."enum_buyer_documents_status" AS ENUM('draft', 'PI sent', 'paid', 'shipped', 'closed', 'cancelled');
  CREATE TYPE "public"."enum_buyer_documents_currency" AS ENUM('USD', 'CNY', 'EUR');
  CREATE TYPE "public"."enum_buyer_documents_incoterm" AS ENUM('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP');
  CREATE TYPE "public"."enum_buyer_documents_shipment_by" AS ENUM('Sea', 'Air', 'Courier', 'Land');
  CREATE TABLE "supplier_orders_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"material" varchar NOT NULL,
  	"spec" varchar,
  	"quantity" numeric,
  	"unit" varchar DEFAULT 'kg',
  	"unit_price" numeric,
  	"supplier_product" varchar,
  	"note" varchar
  );
  
  CREATE TABLE "supplier_orders" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"number" varchar,
  	"kind" "enum_supplier_orders_kind" DEFAULT 'rfq' NOT NULL,
  	"status" "enum_supplier_orders_status" DEFAULT 'draft',
  	"date" timestamp(3) with time zone,
  	"supplier_id" integer NOT NULL,
  	"to_email" varchar,
  	"currency" "enum_supplier_orders_currency" DEFAULT 'USD',
  	"incoterm" "enum_supplier_orders_incoterm",
  	"incoterm_place" varchar,
  	"payment_terms" varchar,
  	"delivery" varchar,
  	"destination" varchar,
  	"documents_required" varchar,
  	"notes" varchar,
  	"subject" varchar,
  	"message" varchar,
  	"rewrite_message" boolean DEFAULT false,
  	"subject_auto" varchar,
  	"message_auto" varchar,
  	"order_id" integer,
  	"from_enquiry_id" integer,
  	"sent_at" timestamp(3) with time zone,
  	"sent_to" varchar,
  	"send_log" varchar,
  	"supplier_reply" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "buyer_documents_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"description" varchar NOT NULL,
  	"spec" varchar,
  	"quantity" numeric,
  	"unit" varchar DEFAULT 'kg',
  	"unit_price" numeric,
  	"hs_code" varchar,
  	"origin" varchar DEFAULT 'China',
  	"packages" numeric,
  	"package_type" varchar,
  	"net_weight" numeric,
  	"gross_weight" numeric,
  	"batch_no" varchar,
  	"mfg_date" varchar,
  	"exp_date" varchar
  );
  
  CREATE TABLE "buyer_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"pi_number" varchar,
  	"pi_date" timestamp(3) with time zone,
  	"validity" timestamp(3) with time zone,
  	"status" "enum_buyer_documents_status" DEFAULT 'draft',
  	"invoice_number" varchar,
  	"invoice_date" timestamp(3) with time zone,
  	"buyer_reference" varchar,
  	"buyer_name" varchar NOT NULL,
  	"buyer_country" varchar,
  	"buyer_contact" varchar,
  	"buyer_address" varchar,
  	"consignee" varchar,
  	"notify_party" varchar,
  	"currency" "enum_buyer_documents_currency" DEFAULT 'USD',
  	"incoterm" "enum_buyer_documents_incoterm",
  	"incoterm_place" varchar,
  	"payment_terms" varchar,
  	"freight" numeric,
  	"insurance" numeric,
  	"discount" numeric,
  	"port_of_loading" varchar,
  	"port_of_discharge" varchar,
  	"shipment_by" "enum_buyer_documents_shipment_by",
  	"delivery_time" varchar,
  	"vessel" varchar,
  	"bl_number" varchar,
  	"shipping_marks" varchar,
  	"remarks" varchar,
  	"order_id" integer,
  	"internal_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "trade_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"company_name" varchar DEFAULT 'NJMC Medical Supplies Co., Ltd' NOT NULL,
  	"address" varchar DEFAULT 'Jianye District, Nanjing, Jiangsu, China',
  	"phone" varchar DEFAULT '+86 132 4453 6191',
  	"email" varchar DEFAULT 'sale@njmcmedicsupp.com',
  	"website" varchar DEFAULT 'njmcmedicsupp.com',
  	"signatory_name" varchar,
  	"signatory_title" varchar,
  	"copy_to" varchar,
  	"bank_details" varchar,
  	"supplier_payment_terms" varchar,
  	"buyer_payment_terms" varchar,
  	"documents_required" varchar DEFAULT 'Certificate of analysis for each batch
  MSDS
  Commercial invoice and packing list
  Certificate of origin if requested',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "supplier_orders_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "buyer_documents_id" integer;
  ALTER TABLE "supplier_orders_items" ADD CONSTRAINT "supplier_orders_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."supplier_orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_order_id_order_matches_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "supplier_orders" ADD CONSTRAINT "supplier_orders_from_enquiry_id_supplier_orders_id_fk" FOREIGN KEY ("from_enquiry_id") REFERENCES "public"."supplier_orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "buyer_documents_items" ADD CONSTRAINT "buyer_documents_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."buyer_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "buyer_documents" ADD CONSTRAINT "buyer_documents_order_id_order_matches_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_matches"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "supplier_orders_items_order_idx" ON "supplier_orders_items" USING btree ("_order");
  CREATE INDEX "supplier_orders_items_parent_id_idx" ON "supplier_orders_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "supplier_orders_number_idx" ON "supplier_orders" USING btree ("number");
  CREATE INDEX "supplier_orders_supplier_idx" ON "supplier_orders" USING btree ("supplier_id");
  CREATE INDEX "supplier_orders_order_idx" ON "supplier_orders" USING btree ("order_id");
  CREATE INDEX "supplier_orders_from_enquiry_idx" ON "supplier_orders" USING btree ("from_enquiry_id");
  CREATE INDEX "supplier_orders_updated_at_idx" ON "supplier_orders" USING btree ("updated_at");
  CREATE INDEX "supplier_orders_created_at_idx" ON "supplier_orders" USING btree ("created_at");
  CREATE INDEX "buyer_documents_items_order_idx" ON "buyer_documents_items" USING btree ("_order");
  CREATE INDEX "buyer_documents_items_parent_id_idx" ON "buyer_documents_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "buyer_documents_pi_number_idx" ON "buyer_documents" USING btree ("pi_number");
  CREATE UNIQUE INDEX "buyer_documents_invoice_number_idx" ON "buyer_documents" USING btree ("invoice_number");
  CREATE INDEX "buyer_documents_order_idx" ON "buyer_documents" USING btree ("order_id");
  CREATE INDEX "buyer_documents_updated_at_idx" ON "buyer_documents" USING btree ("updated_at");
  CREATE INDEX "buyer_documents_created_at_idx" ON "buyer_documents" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_supplier_orders_fk" FOREIGN KEY ("supplier_orders_id") REFERENCES "public"."supplier_orders"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_buyer_documents_fk" FOREIGN KEY ("buyer_documents_id") REFERENCES "public"."buyer_documents"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_supplier_orders_id_idx" ON "payload_locked_documents_rels" USING btree ("supplier_orders_id");
  CREATE INDEX "payload_locked_documents_rels_buyer_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("buyer_documents_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "supplier_orders_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "supplier_orders" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "buyer_documents_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "buyer_documents" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trade_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "supplier_orders_items" CASCADE;
  DROP TABLE "supplier_orders" CASCADE;
  DROP TABLE "buyer_documents_items" CASCADE;
  DROP TABLE "buyer_documents" CASCADE;
  DROP TABLE "trade_settings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_supplier_orders_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_buyer_documents_fk";
  
  DROP INDEX "payload_locked_documents_rels_supplier_orders_id_idx";
  DROP INDEX "payload_locked_documents_rels_buyer_documents_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "supplier_orders_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "buyer_documents_id";
  DROP TYPE "public"."enum_supplier_orders_kind";
  DROP TYPE "public"."enum_supplier_orders_status";
  DROP TYPE "public"."enum_supplier_orders_currency";
  DROP TYPE "public"."enum_supplier_orders_incoterm";
  DROP TYPE "public"."enum_buyer_documents_status";
  DROP TYPE "public"."enum_buyer_documents_currency";
  DROP TYPE "public"."enum_buyer_documents_incoterm";
  DROP TYPE "public"."enum_buyer_documents_shipment_by";`)
}
