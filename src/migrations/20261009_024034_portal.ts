import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "portal_users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "portal_users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"client_id" integer NOT NULL,
  	"active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "portal_users_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "portal_users_id" integer;
  ALTER TABLE "portal_users_sessions" ADD CONSTRAINT "portal_users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "portal_users" ADD CONSTRAINT "portal_users_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "portal_users_sessions_order_idx" ON "portal_users_sessions" USING btree ("_order");
  CREATE INDEX "portal_users_sessions_parent_id_idx" ON "portal_users_sessions" USING btree ("_parent_id");
  CREATE INDEX "portal_users_client_idx" ON "portal_users" USING btree ("client_id");
  CREATE INDEX "portal_users_updated_at_idx" ON "portal_users" USING btree ("updated_at");
  CREATE INDEX "portal_users_created_at_idx" ON "portal_users" USING btree ("created_at");
  CREATE UNIQUE INDEX "portal_users_email_idx" ON "portal_users" USING btree ("email");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_portal_users_fk" FOREIGN KEY ("portal_users_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_portal_users_fk" FOREIGN KEY ("portal_users_id") REFERENCES "public"."portal_users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_portal_users_id_idx" ON "payload_locked_documents_rels" USING btree ("portal_users_id");
  CREATE INDEX "payload_preferences_rels_portal_users_id_idx" ON "payload_preferences_rels" USING btree ("portal_users_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "portal_users_sessions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "portal_users" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "portal_users_sessions" CASCADE;
  DROP TABLE "portal_users" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_portal_users_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_portal_users_fk";
  
  DROP INDEX "payload_locked_documents_rels_portal_users_id_idx";
  DROP INDEX "payload_preferences_rels_portal_users_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "portal_users_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "portal_users_id";`)
}
