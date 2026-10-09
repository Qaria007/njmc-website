import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "inbox_messages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"received_at" timestamp(3) with time zone,
  	"from" varchar,
  	"doc_number" varchar,
  	"done" boolean DEFAULT false,
  	"subject" varchar,
  	"supplier_order_id" integer,
  	"buyer_document_id" integer,
  	"text" varchar,
  	"ai_note" varchar,
  	"message_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "inbox_messages_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"trade_files_id" integer
  );
  
  ALTER TABLE "supplier_orders" ADD COLUMN "reply_arrived_at" timestamp(3) with time zone;
  ALTER TABLE "supplier_orders" ADD COLUMN "ai_proposal" jsonb;
  ALTER TABLE "supplier_orders" ADD COLUMN "ai_proposal_at" timestamp(3) with time zone;
  ALTER TABLE "buyer_documents" ADD COLUMN "buyer_phone" varchar;
  ALTER TABLE "buyer_documents" ADD COLUMN "client_reply_at" timestamp(3) with time zone;
  ALTER TABLE "buyer_documents" ADD COLUMN "share_token" varchar;
  ALTER TABLE "buyer_documents" ADD COLUMN "share_created_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "inbox_messages_id" integer;
  ALTER TABLE "trade_settings" ADD COLUMN "inbox_on" boolean DEFAULT false;
  ALTER TABLE "trade_settings" ADD COLUMN "imap_host" varchar DEFAULT 'imap.gmail.com';
  ALTER TABLE "trade_settings" ADD COLUMN "imap_user" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "new_imap_password" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "imap_pass_hint" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "remove_imap_password" boolean DEFAULT false;
  ALTER TABLE "trade_settings" ADD COLUMN "inbox_checked_at" timestamp(3) with time zone;
  ALTER TABLE "trade_settings" ADD COLUMN "inbox_status" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "imap_pass_sealed" varchar;
  ALTER TABLE "trade_settings" ADD COLUMN "inbox_last_uid" numeric;
  ALTER TABLE "trade_settings" ADD COLUMN "inbox_uid_validity" varchar;
  ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_supplier_order_id_supplier_orders_id_fk" FOREIGN KEY ("supplier_order_id") REFERENCES "public"."supplier_orders"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_buyer_document_id_buyer_documents_id_fk" FOREIGN KEY ("buyer_document_id") REFERENCES "public"."buyer_documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "inbox_messages_rels" ADD CONSTRAINT "inbox_messages_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."inbox_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "inbox_messages_rels" ADD CONSTRAINT "inbox_messages_rels_trade_files_fk" FOREIGN KEY ("trade_files_id") REFERENCES "public"."trade_files"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "inbox_messages_supplier_order_idx" ON "inbox_messages" USING btree ("supplier_order_id");
  CREATE INDEX "inbox_messages_buyer_document_idx" ON "inbox_messages" USING btree ("buyer_document_id");
  CREATE UNIQUE INDEX "inbox_messages_message_id_idx" ON "inbox_messages" USING btree ("message_id");
  CREATE INDEX "inbox_messages_updated_at_idx" ON "inbox_messages" USING btree ("updated_at");
  CREATE INDEX "inbox_messages_created_at_idx" ON "inbox_messages" USING btree ("created_at");
  CREATE INDEX "inbox_messages_rels_order_idx" ON "inbox_messages_rels" USING btree ("order");
  CREATE INDEX "inbox_messages_rels_parent_idx" ON "inbox_messages_rels" USING btree ("parent_id");
  CREATE INDEX "inbox_messages_rels_path_idx" ON "inbox_messages_rels" USING btree ("path");
  CREATE INDEX "inbox_messages_rels_trade_files_id_idx" ON "inbox_messages_rels" USING btree ("trade_files_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_inbox_messages_fk" FOREIGN KEY ("inbox_messages_id") REFERENCES "public"."inbox_messages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "buyer_documents_share_token_idx" ON "buyer_documents" USING btree ("share_token");
  CREATE INDEX "payload_locked_documents_rels_inbox_messages_id_idx" ON "payload_locked_documents_rels" USING btree ("inbox_messages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "inbox_messages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "inbox_messages_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "inbox_messages" CASCADE;
  DROP TABLE "inbox_messages_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_inbox_messages_fk";
  
  DROP INDEX "buyer_documents_share_token_idx";
  DROP INDEX "payload_locked_documents_rels_inbox_messages_id_idx";
  ALTER TABLE "supplier_orders" DROP COLUMN "reply_arrived_at";
  ALTER TABLE "supplier_orders" DROP COLUMN "ai_proposal";
  ALTER TABLE "supplier_orders" DROP COLUMN "ai_proposal_at";
  ALTER TABLE "buyer_documents" DROP COLUMN "buyer_phone";
  ALTER TABLE "buyer_documents" DROP COLUMN "client_reply_at";
  ALTER TABLE "buyer_documents" DROP COLUMN "share_token";
  ALTER TABLE "buyer_documents" DROP COLUMN "share_created_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "inbox_messages_id";
  ALTER TABLE "trade_settings" DROP COLUMN "inbox_on";
  ALTER TABLE "trade_settings" DROP COLUMN "imap_host";
  ALTER TABLE "trade_settings" DROP COLUMN "imap_user";
  ALTER TABLE "trade_settings" DROP COLUMN "new_imap_password";
  ALTER TABLE "trade_settings" DROP COLUMN "imap_pass_hint";
  ALTER TABLE "trade_settings" DROP COLUMN "remove_imap_password";
  ALTER TABLE "trade_settings" DROP COLUMN "inbox_checked_at";
  ALTER TABLE "trade_settings" DROP COLUMN "inbox_status";
  ALTER TABLE "trade_settings" DROP COLUMN "imap_pass_sealed";
  ALTER TABLE "trade_settings" DROP COLUMN "inbox_last_uid";
  ALTER TABLE "trade_settings" DROP COLUMN "inbox_uid_validity";`)
}
