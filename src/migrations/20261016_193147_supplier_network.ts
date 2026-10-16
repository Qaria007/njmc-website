import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_order_matches_network_search" AS ENUM('missing', 'all', 'off');
  CREATE TYPE "public"."enum_network_clients_plan" AS ENUM('starter', 'business');
  CREATE TYPE "public"."enum_network_signals_event" AS ENUM('enquiry_sent', 'replied', 'quoted', 'ordered', 'delivered', 'problem', 'shared');
  CREATE TABLE "order_matches_lines_network" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ref" varchar,
  	"name" varchar,
  	"country" varchar,
  	"city" varchar,
  	"website" varchar,
  	"email" varchar,
  	"phone" varchar,
  	"wechat" varchar,
  	"listed_as" varchar,
  	"documents" varchar,
  	"standing" varchar
  );
  
  CREATE TABLE "network_clients" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"plan" "enum_network_clients_plan" DEFAULT 'starter' NOT NULL,
  	"active" boolean DEFAULT true,
  	"suppliers_per_product" numeric DEFAULT 3 NOT NULL,
  	"products_per_month" numeric DEFAULT 20 NOT NULL,
  	"contact_email" varchar,
  	"notes" varchar,
  	"used_this_month" numeric,
  	"usage_month" varchar,
  	"last_seen_at" timestamp(3) with time zone,
  	"token_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "network_reveals_suppliers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"supplier_id" integer NOT NULL
  );
  
  CREATE TABLE "network_reveals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"product_key" varchar NOT NULL,
  	"product_label" varchar,
  	"month" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "network_signals" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"client_id" integer NOT NULL,
  	"supplier_id" integer NOT NULL,
  	"event" "enum_network_signals_event" NOT NULL,
  	"days" numeric,
  	"at" timestamp(3) with time zone NOT NULL,
  	"month" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "order_matches_lines" ADD COLUMN "network_note" varchar;
  ALTER TABLE "order_matches" ADD COLUMN "network_search" "enum_order_matches_network_search" DEFAULT 'missing';
  ALTER TABLE "order_matches" ADD COLUMN "network_usage" varchar;
  ALTER TABLE "suppliers" ADD COLUMN "share_with_network" boolean DEFAULT false;
  ALTER TABLE "suppliers" ADD COLUMN "shared_at" timestamp(3) with time zone;
  ALTER TABLE "suppliers" ADD COLUMN "share_note" varchar;
  ALTER TABLE "suppliers" ADD COLUMN "network_ref" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "network_clients_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "network_reveals_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "network_signals_id" integer;
  ALTER TABLE "order_matches_lines_network" ADD CONSTRAINT "order_matches_lines_network_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."order_matches_lines"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "network_reveals_suppliers" ADD CONSTRAINT "network_reveals_suppliers_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "network_reveals_suppliers" ADD CONSTRAINT "network_reveals_suppliers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."network_reveals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "network_reveals" ADD CONSTRAINT "network_reveals_client_id_network_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."network_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "network_signals" ADD CONSTRAINT "network_signals_client_id_network_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."network_clients"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "network_signals" ADD CONSTRAINT "network_signals_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "order_matches_lines_network_order_idx" ON "order_matches_lines_network" USING btree ("_order");
  CREATE INDEX "order_matches_lines_network_parent_id_idx" ON "order_matches_lines_network" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "network_clients_slug_idx" ON "network_clients" USING btree ("slug");
  CREATE INDEX "network_clients_token_hash_idx" ON "network_clients" USING btree ("token_hash");
  CREATE INDEX "network_clients_updated_at_idx" ON "network_clients" USING btree ("updated_at");
  CREATE INDEX "network_clients_created_at_idx" ON "network_clients" USING btree ("created_at");
  CREATE INDEX "network_reveals_suppliers_order_idx" ON "network_reveals_suppliers" USING btree ("_order");
  CREATE INDEX "network_reveals_suppliers_parent_id_idx" ON "network_reveals_suppliers" USING btree ("_parent_id");
  CREATE INDEX "network_reveals_suppliers_supplier_idx" ON "network_reveals_suppliers" USING btree ("supplier_id");
  CREATE INDEX "network_reveals_client_idx" ON "network_reveals" USING btree ("client_id");
  CREATE INDEX "network_reveals_product_key_idx" ON "network_reveals" USING btree ("product_key");
  CREATE UNIQUE INDEX "network_reveals_client_product_uidx" ON "network_reveals" USING btree ("client_id", "product_key");
  CREATE INDEX "network_reveals_month_idx" ON "network_reveals" USING btree ("month");
  CREATE INDEX "network_reveals_updated_at_idx" ON "network_reveals" USING btree ("updated_at");
  CREATE INDEX "network_reveals_created_at_idx" ON "network_reveals" USING btree ("created_at");
  CREATE INDEX "network_signals_client_idx" ON "network_signals" USING btree ("client_id");
  CREATE INDEX "network_signals_supplier_idx" ON "network_signals" USING btree ("supplier_id");
  CREATE INDEX "network_signals_month_idx" ON "network_signals" USING btree ("month");
  CREATE INDEX "network_signals_updated_at_idx" ON "network_signals" USING btree ("updated_at");
  CREATE INDEX "network_signals_created_at_idx" ON "network_signals" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_network_clients_fk" FOREIGN KEY ("network_clients_id") REFERENCES "public"."network_clients"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_network_reveals_fk" FOREIGN KEY ("network_reveals_id") REFERENCES "public"."network_reveals"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_network_signals_fk" FOREIGN KEY ("network_signals_id") REFERENCES "public"."network_signals"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "suppliers_network_ref_idx" ON "suppliers" USING btree ("network_ref");
  CREATE INDEX "payload_locked_documents_rels_network_clients_id_idx" ON "payload_locked_documents_rels" USING btree ("network_clients_id");
  CREATE INDEX "payload_locked_documents_rels_network_reveals_id_idx" ON "payload_locked_documents_rels" USING btree ("network_reveals_id");
  CREATE INDEX "payload_locked_documents_rels_network_signals_id_idx" ON "payload_locked_documents_rels" USING btree ("network_signals_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "order_matches_lines_network" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "network_clients" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "network_reveals_suppliers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "network_reveals" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "network_signals" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "order_matches_lines_network" CASCADE;
  DROP TABLE "network_clients" CASCADE;
  DROP TABLE "network_reveals_suppliers" CASCADE;
  DROP TABLE "network_reveals" CASCADE;
  DROP TABLE "network_signals" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_network_clients_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_network_reveals_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_network_signals_fk";
  
  DROP INDEX "suppliers_network_ref_idx";
  DROP INDEX "payload_locked_documents_rels_network_clients_id_idx";
  DROP INDEX "payload_locked_documents_rels_network_reveals_id_idx";
  DROP INDEX "payload_locked_documents_rels_network_signals_id_idx";
  ALTER TABLE "order_matches_lines" DROP COLUMN "network_note";
  ALTER TABLE "order_matches" DROP COLUMN "network_search";
  ALTER TABLE "order_matches" DROP COLUMN "network_usage";
  ALTER TABLE "suppliers" DROP COLUMN "share_with_network";
  ALTER TABLE "suppliers" DROP COLUMN "shared_at";
  ALTER TABLE "suppliers" DROP COLUMN "share_note";
  ALTER TABLE "suppliers" DROP COLUMN "network_ref";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "network_clients_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "network_reveals_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "network_signals_id";
  DROP TYPE "public"."enum_order_matches_network_search";
  DROP TYPE "public"."enum_network_clients_plan";
  DROP TYPE "public"."enum_network_signals_event";`)
}
