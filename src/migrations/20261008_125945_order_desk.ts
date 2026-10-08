import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clients_currency" AS ENUM('USD', 'CNY', 'EUR');
  CREATE TYPE "public"."enum_clients_incoterm" AS ENUM('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP');
  CREATE TYPE "public"."enum_supplier_orders_quote_currency" AS ENUM('USD', 'CNY', 'EUR');
  CREATE TYPE "public"."enum_supplier_orders_quote_incoterm" AS ENUM('EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DDP');
  CREATE TYPE "public"."enum_supplier_orders_quote_source" AS ENUM('supplier form', 'email', 'WeChat or phone');
  CREATE TYPE "public"."enum_buyer_documents_documents_sent" AS ENUM('Proforma invoice', 'Commercial invoice', 'Packing list', 'Certificate of analysis', 'Certificate of origin', 'B/L or AWB copy', 'Original documents by courier', 'Insurance certificate');
  CREATE TYPE "public"."enum_trade_files_kind" AS ENUM('client-order', 'contract', 'pi', 'quotation', 'invoice', 'packing-list', 'coa', 'co', 'bl', 'payment', 'photo', 'correspondence', 'other');
  CREATE TYPE "public"."enum_payments_direction" AS ENUM('in', 'out', 'expense');
  CREATE TYPE "public"."enum_payments_category" AS ENUM('freight', 'customs and duties', 'bank charges', 'inspection and testing', 'samples', 'travel', 'commission', 'office', 'other');
  CREATE TYPE "public"."enum_payments_currency" AS ENUM('USD', 'CNY', 'EUR');
  CREATE TYPE "public"."enum_payments_method" AS ENUM('T/T bank transfer', 'L/C', 'PayPal', 'Alipay', 'WeChat Pay', 'Cash', 'Other');
  ALTER TYPE "public"."enum_buyer_documents_status" ADD VALUE 'confirmed' BEFORE 'paid';
  ALTER TYPE "public"."enum_buyer_documents_status" ADD VALUE 'in production' BEFORE 'shipped';
  ALTER TYPE "public"."enum_buyer_documents_status" ADD VALUE 'delivered' BEFORE 'closed';
  CREATE TABLE "clients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"country" varchar,
  	"registration_no" varchar,
  	"address" varchar,
  	"contact_person" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"currency" "enum_clients_currency" DEFAULT 'USD',
  	"incoterm" "enum_clients_incoterm",
  	"incoterm_place" varchar,
  	"payment_terms" varchar,
  	"consignee" varchar,
  	"notify_party" varchar,
  	"notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "buyer_documents_documents_sent" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_buyer_documents_documents_sent",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "trade_files" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"kind" "enum_trade_files_kind" DEFAULT 'other',
  	"date" timestamp(3) with time zone,
  	"client_id" integer,
  	"supplier_id" integer,
  	"order_id" integer,
  	"buyer_document_id" integer,
  	"supplier_order_id" integer,
  	"notes" varchar,
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
  
  CREATE TABLE "payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"date" timestamp(3) with time zone NOT NULL,
  	"direction" "enum_payments_direction" NOT NULL,
  	"category" "enum_payments_category",
  	"amount" numeric NOT NULL,
  	"currency" "enum_payments_currency" DEFAULT 'USD' NOT NULL,
  	"usd_rate" numeric,
  	"amount_usd" numeric,
  	"buyer_document_id" integer,
  	"supplier_order_id" integer,
  	"order_id" integer,
  	"client_id" integer,
  	"supplier_id" integer,
  	"paid_to" varchar,
  	"method" "enum_payments_method",
  	"reference" varchar,
  	"proof_id" integer,
  	"notes" varchar,
  	"void" boolean DEFAULT false,
  	"void_reason" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "accounts_overview" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "order_matches" ADD COLUMN "client_id" integer;
  ALTER TABLE "supplier_orders_items" ADD COLUMN "quoted_price" numeric;
  ALTER TABLE "supplier_orders_items" ADD COLUMN "moq" varchar;
  ALTER TABLE "supplier_orders_items" ADD COLUMN "lead_time" varchar;
  ALTER TABLE "supplier_orders_items" ADD COLUMN "quote_note" varchar;
  ALTER TABLE "supplier_orders_items" ADD COLUMN "requested" varchar;
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_currency" "enum_supplier_orders_quote_currency";
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_incoterm" "enum_supplier_orders_quote_incoterm";
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_incoterm_place" varchar;
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_valid_until" timestamp(3) with time zone;
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_payment_terms" varchar;
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_contact" varchar;
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_source" "enum_supplier_orders_quote_source";
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_received_at" timestamp(3) with time zone;
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_notes" varchar;
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_log" varchar;
  ALTER TABLE "supplier_orders" ADD COLUMN "quote_token" varchar;
  ALTER TABLE "buyer_documents_items" ADD COLUMN "cost_price" numeric;
  ALTER TABLE "buyer_documents_items" ADD COLUMN "cost_supplier_id" integer;
  ALTER TABLE "buyer_documents_items" ADD COLUMN "cost_note" varchar;
  ALTER TABLE "buyer_documents" ADD COLUMN "client_id" integer;
  ALTER TABLE "buyer_documents" ADD COLUMN "buyer_email" varchar;
  ALTER TABLE "buyer_documents" ADD COLUMN "ready_date" timestamp(3) with time zone;
  ALTER TABLE "buyer_documents" ADD COLUMN "etd" timestamp(3) with time zone;
  ALTER TABLE "buyer_documents" ADD COLUMN "eta" timestamp(3) with time zone;
  ALTER TABLE "buyer_documents" ADD COLUMN "forwarder" varchar;
  ALTER TABLE "buyer_documents" ADD COLUMN "follow_up" varchar;
  ALTER TABLE "buyer_documents" ADD COLUMN "send_log" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "clients_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trade_files_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payments_id" integer;
  ALTER TABLE "trade_settings" ADD COLUMN "logo_id" integer;
  ALTER TABLE "trade_settings" ADD COLUMN "default_margin" numeric;
  ALTER TABLE "trade_settings" ADD COLUMN "cny_per_usd" numeric;
  ALTER TABLE "trade_settings" ADD COLUMN "usd_per_eur" numeric;
  ALTER TABLE "buyer_documents_documents_sent" ADD CONSTRAINT "buyer_documents_documents_sent_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."buyer_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trade_files" ADD CONSTRAINT "trade_files_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trade_files" ADD CONSTRAINT "trade_files_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trade_files" ADD CONSTRAINT "trade_files_order_id_order_matches_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trade_files" ADD CONSTRAINT "trade_files_buyer_document_id_buyer_documents_id_fk" FOREIGN KEY ("buyer_document_id") REFERENCES "public"."buyer_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "trade_files" ADD CONSTRAINT "trade_files_supplier_order_id_supplier_orders_id_fk" FOREIGN KEY ("supplier_order_id") REFERENCES "public"."supplier_orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_document_id_buyer_documents_id_fk" FOREIGN KEY ("buyer_document_id") REFERENCES "public"."buyer_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_supplier_order_id_supplier_orders_id_fk" FOREIGN KEY ("supplier_order_id") REFERENCES "public"."supplier_orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_order_matches_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order_matches"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payments" ADD CONSTRAINT "payments_proof_id_trade_files_id_fk" FOREIGN KEY ("proof_id") REFERENCES "public"."trade_files"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "clients_name_idx" ON "clients" USING btree ("name");
  CREATE INDEX "clients_updated_at_idx" ON "clients" USING btree ("updated_at");
  CREATE INDEX "clients_created_at_idx" ON "clients" USING btree ("created_at");
  CREATE INDEX "buyer_documents_documents_sent_order_idx" ON "buyer_documents_documents_sent" USING btree ("order");
  CREATE INDEX "buyer_documents_documents_sent_parent_idx" ON "buyer_documents_documents_sent" USING btree ("parent_id");
  CREATE INDEX "trade_files_client_idx" ON "trade_files" USING btree ("client_id");
  CREATE INDEX "trade_files_supplier_idx" ON "trade_files" USING btree ("supplier_id");
  CREATE INDEX "trade_files_order_idx" ON "trade_files" USING btree ("order_id");
  CREATE INDEX "trade_files_buyer_document_idx" ON "trade_files" USING btree ("buyer_document_id");
  CREATE INDEX "trade_files_supplier_order_idx" ON "trade_files" USING btree ("supplier_order_id");
  CREATE INDEX "trade_files_updated_at_idx" ON "trade_files" USING btree ("updated_at");
  CREATE INDEX "trade_files_created_at_idx" ON "trade_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "trade_files_filename_idx" ON "trade_files" USING btree ("filename");
  CREATE INDEX "payments_buyer_document_idx" ON "payments" USING btree ("buyer_document_id");
  CREATE INDEX "payments_supplier_order_idx" ON "payments" USING btree ("supplier_order_id");
  CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");
  CREATE INDEX "payments_client_idx" ON "payments" USING btree ("client_id");
  CREATE INDEX "payments_supplier_idx" ON "payments" USING btree ("supplier_id");
  CREATE INDEX "payments_proof_idx" ON "payments" USING btree ("proof_id");
  CREATE INDEX "payments_updated_at_idx" ON "payments" USING btree ("updated_at");
  CREATE INDEX "payments_created_at_idx" ON "payments" USING btree ("created_at");
  ALTER TABLE "order_matches" ADD CONSTRAINT "order_matches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "buyer_documents_items" ADD CONSTRAINT "buyer_documents_items_cost_supplier_id_suppliers_id_fk" FOREIGN KEY ("cost_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "buyer_documents" ADD CONSTRAINT "buyer_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clients_fk" FOREIGN KEY ("clients_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trade_files_fk" FOREIGN KEY ("trade_files_id") REFERENCES "public"."trade_files"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payments_fk" FOREIGN KEY ("payments_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trade_settings" ADD CONSTRAINT "trade_settings_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "order_matches_client_idx" ON "order_matches" USING btree ("client_id");
  CREATE UNIQUE INDEX "supplier_orders_quote_token_idx" ON "supplier_orders" USING btree ("quote_token");
  CREATE INDEX "buyer_documents_items_cost_supplier_idx" ON "buyer_documents_items" USING btree ("cost_supplier_id");
  CREATE INDEX "buyer_documents_client_idx" ON "buyer_documents" USING btree ("client_id");
  CREATE INDEX "payload_locked_documents_rels_clients_id_idx" ON "payload_locked_documents_rels" USING btree ("clients_id");
  CREATE INDEX "payload_locked_documents_rels_trade_files_id_idx" ON "payload_locked_documents_rels" USING btree ("trade_files_id");
  CREATE INDEX "payload_locked_documents_rels_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("payments_id");
  CREATE INDEX "trade_settings_logo_idx" ON "trade_settings" USING btree ("logo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clients" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "buyer_documents_documents_sent" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trade_files" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "accounts_overview" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "clients" CASCADE;
  DROP TABLE "buyer_documents_documents_sent" CASCADE;
  DROP TABLE "trade_files" CASCADE;
  DROP TABLE "payments" CASCADE;
  DROP TABLE "accounts_overview" CASCADE;
  ALTER TABLE "order_matches" DROP CONSTRAINT "order_matches_client_id_clients_id_fk";
  
  ALTER TABLE "buyer_documents_items" DROP CONSTRAINT "buyer_documents_items_cost_supplier_id_suppliers_id_fk";
  
  ALTER TABLE "buyer_documents" DROP CONSTRAINT "buyer_documents_client_id_clients_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_clients_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trade_files_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_payments_fk";
  
  ALTER TABLE "trade_settings" DROP CONSTRAINT "trade_settings_logo_id_media_id_fk";
  
  ALTER TABLE "buyer_documents" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "buyer_documents" ALTER COLUMN "status" SET DEFAULT 'draft'::text;
  DROP TYPE "public"."enum_buyer_documents_status";
  CREATE TYPE "public"."enum_buyer_documents_status" AS ENUM('draft', 'PI sent', 'paid', 'shipped', 'closed', 'cancelled');
  ALTER TABLE "buyer_documents" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."enum_buyer_documents_status";
  ALTER TABLE "buyer_documents" ALTER COLUMN "status" SET DATA TYPE "public"."enum_buyer_documents_status" USING "status"::"public"."enum_buyer_documents_status";
  DROP INDEX "order_matches_client_idx";
  DROP INDEX "supplier_orders_quote_token_idx";
  DROP INDEX "buyer_documents_items_cost_supplier_idx";
  DROP INDEX "buyer_documents_client_idx";
  DROP INDEX "payload_locked_documents_rels_clients_id_idx";
  DROP INDEX "payload_locked_documents_rels_trade_files_id_idx";
  DROP INDEX "payload_locked_documents_rels_payments_id_idx";
  DROP INDEX "trade_settings_logo_idx";
  ALTER TABLE "order_matches" DROP COLUMN "client_id";
  ALTER TABLE "supplier_orders_items" DROP COLUMN "quoted_price";
  ALTER TABLE "supplier_orders_items" DROP COLUMN "moq";
  ALTER TABLE "supplier_orders_items" DROP COLUMN "lead_time";
  ALTER TABLE "supplier_orders_items" DROP COLUMN "quote_note";
  ALTER TABLE "supplier_orders_items" DROP COLUMN "requested";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_currency";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_incoterm";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_incoterm_place";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_valid_until";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_payment_terms";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_contact";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_source";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_received_at";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_notes";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_log";
  ALTER TABLE "supplier_orders" DROP COLUMN "quote_token";
  ALTER TABLE "buyer_documents_items" DROP COLUMN "cost_price";
  ALTER TABLE "buyer_documents_items" DROP COLUMN "cost_supplier_id";
  ALTER TABLE "buyer_documents_items" DROP COLUMN "cost_note";
  ALTER TABLE "buyer_documents" DROP COLUMN "client_id";
  ALTER TABLE "buyer_documents" DROP COLUMN "buyer_email";
  ALTER TABLE "buyer_documents" DROP COLUMN "ready_date";
  ALTER TABLE "buyer_documents" DROP COLUMN "etd";
  ALTER TABLE "buyer_documents" DROP COLUMN "eta";
  ALTER TABLE "buyer_documents" DROP COLUMN "forwarder";
  ALTER TABLE "buyer_documents" DROP COLUMN "follow_up";
  ALTER TABLE "buyer_documents" DROP COLUMN "send_log";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "clients_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "trade_files_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payments_id";
  ALTER TABLE "trade_settings" DROP COLUMN "logo_id";
  ALTER TABLE "trade_settings" DROP COLUMN "default_margin";
  ALTER TABLE "trade_settings" DROP COLUMN "cny_per_usd";
  ALTER TABLE "trade_settings" DROP COLUMN "usd_per_eur";
  DROP TYPE "public"."enum_clients_currency";
  DROP TYPE "public"."enum_clients_incoterm";
  DROP TYPE "public"."enum_supplier_orders_quote_currency";
  DROP TYPE "public"."enum_supplier_orders_quote_incoterm";
  DROP TYPE "public"."enum_supplier_orders_quote_source";
  DROP TYPE "public"."enum_buyer_documents_documents_sent";
  DROP TYPE "public"."enum_trade_files_kind";
  DROP TYPE "public"."enum_payments_direction";
  DROP TYPE "public"."enum_payments_category";
  DROP TYPE "public"."enum_payments_currency";
  DROP TYPE "public"."enum_payments_method";`)
}
