import { pool } from "@/db";

// Idempotent schema migration for Folio.
//
// `npx drizzle-kit push` remains the primary way to sync the schema, but this
// guard runs once per server process so any existing deployment (including
// databases created before milestones existed) upgrades itself safely.
// Names and types mirror what drizzle-kit generates from src/db/schema.ts, so
// both paths converge on exactly the same schema.

const fk = (table: string, name: string, column: string, target: string, onDelete: "cascade" | "set null") => `
DO $$ BEGIN
  ALTER TABLE "${table}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${column}") REFERENCES "public"."${target}"("id") ON DELETE ${onDelete} ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;`;

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "folio_users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "name" text NOT NULL,
    "email" text NOT NULL,
    "password_hash" text,
    "provider" text DEFAULT 'email' NOT NULL,
    "weekly_goal" integer DEFAULT 12 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "folio_users_email_unique" UNIQUE("email")
  )`,
  `CREATE TABLE IF NOT EXISTS "folio_sessions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "token_hash" text NOT NULL,
    "user_id" uuid NOT NULL,
    "expires_at" timestamp NOT NULL,
    CONSTRAINT "folio_sessions_token_hash_unique" UNIQUE("token_hash")
  )`,
  `CREATE TABLE IF NOT EXISTS "folio_projects" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "status" text DEFAULT 'Planning' NOT NULL,
    "priority" text DEFAULT 'Medium' NOT NULL,
    "color" text DEFAULT 'violet' NOT NULL,
    "icon" text DEFAULT 'layout' NOT NULL,
    "category" text DEFAULT 'Personal' NOT NULL,
    "due_date" text,
    "favorite" boolean DEFAULT false NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "folio_tasks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "project_id" uuid,
    "title" text NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "priority" text DEFAULT 'Medium' NOT NULL,
    "due_date" text,
    "completed_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "folio_ideas" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "title" text NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "category" text DEFAULT 'Personal' NOT NULL,
    "color" text DEFAULT 'yellow' NOT NULL,
    "status" text DEFAULT 'Just an idea' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "folio_activities" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "text" text NOT NULL,
    "type" text DEFAULT 'project' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  // --- Projects workspace upgrade -------------------------------------
  `ALTER TABLE "folio_projects" ADD COLUMN IF NOT EXISTS "start_date" text`,
  `ALTER TABLE "folio_projects" ADD COLUMN IF NOT EXISTS "archived" boolean DEFAULT false NOT NULL`,
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'folio_projects' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE "folio_projects" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
      UPDATE "folio_projects" SET "updated_at" = "created_at";
    END IF;
  END $$;`,
  `CREATE TABLE IF NOT EXISTS "folio_milestones" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "project_id" uuid NOT NULL,
    "title" text NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "due_date" text,
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "folio_tasks" ADD COLUMN IF NOT EXISTS "milestone_id" uuid`,
  `ALTER TABLE "folio_activities" ADD COLUMN IF NOT EXISTS "project_id" uuid`,
  // --- Tasks workspace upgrade ----------------------------------------
  `ALTER TABLE "folio_tasks" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'todo' NOT NULL`,
  `ALTER TABLE "folio_tasks" ADD COLUMN IF NOT EXISTS "start_date" text`,
  `ALTER TABLE "folio_tasks" ADD COLUMN IF NOT EXISTS "labels" text[] DEFAULT '{}'::text[] NOT NULL`,
  `ALTER TABLE "folio_tasks" ALTER COLUMN "labels" DROP DEFAULT`,
  `ALTER TABLE "folio_tasks" ADD COLUMN IF NOT EXISTS "estimate_minutes" integer`,
  `ALTER TABLE "folio_tasks" ADD COLUMN IF NOT EXISTS "notes" text DEFAULT '' NOT NULL`,
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'folio_tasks' AND column_name = 'updated_at'
    ) THEN
      ALTER TABLE "folio_tasks" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
      UPDATE "folio_tasks" SET "updated_at" = COALESCE("completed_at", "created_at");
    END IF;
  END $$;`,
  // Enforce the status ⇔ completed invariant for legacy rows (and for columns
  // that drizzle-kit push may have created without a backfill). Idempotent.
  `UPDATE "folio_tasks" SET "status" = 'todo' WHERE "status" NOT IN ('todo', 'in_progress', 'in_review', 'done')`,
  `UPDATE "folio_tasks" SET "status" = 'done' WHERE "completed" = true AND "status" <> 'done'`,
  `UPDATE "folio_tasks" SET "status" = 'todo' WHERE "completed" = false AND "status" = 'done'`,
  `CREATE TABLE IF NOT EXISTS "folio_subtasks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "task_id" uuid NOT NULL,
    "title" text NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "completed_at" timestamp,
    "position" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  )`,
  `ALTER TABLE "folio_activities" ADD COLUMN IF NOT EXISTS "task_id" uuid`,
  // --- Google Calendar integration ------------------------------------
  `CREATE TABLE IF NOT EXISTS "folio_google_accounts" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "google_user_id" text NOT NULL,
    "email" text NOT NULL,
    "name" text DEFAULT '' NOT NULL,
    "picture" text,
    "refresh_token_enc" text NOT NULL,
    "access_token_enc" text,
    "access_token_expires_at" timestamp,
    "scopes" text[] DEFAULT '{}'::text[] NOT NULL,
    "write_enabled" boolean DEFAULT false NOT NULL,
    "connection_error" text,
    "last_sync_at" timestamp,
    "last_sync_status" text DEFAULT 'never' NOT NULL,
    "last_sync_detail" jsonb,
    "revoked_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "folio_google_accounts_user_idx" UNIQUE("user_id")
  )`,
  `CREATE TABLE IF NOT EXISTS "folio_google_calendars" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "account_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "calendar_id" text NOT NULL,
    "summary" text DEFAULT '' NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "background_color" text,
    "primary" boolean DEFAULT false NOT NULL,
    "selected" boolean DEFAULT true NOT NULL,
    "visible" boolean DEFAULT true NOT NULL,
    "sync_token" text,
    "last_synced_at" timestamp,
    "last_error" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS "folio_google_events" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "account_id" uuid NOT NULL,
    "calendar_id" text NOT NULL,
    "google_event_id" text NOT NULL,
    "recurring_event_id" text,
    "title" text DEFAULT '' NOT NULL,
    "description" text DEFAULT '' NOT NULL,
    "location" text DEFAULT '' NOT NULL,
    "start_at" timestamp,
    "end_at" timestamp,
    "start_date" text,
    "end_date" text,
    "all_day" boolean DEFAULT false NOT NULL,
    "timezone" text,
    "status" text DEFAULT 'confirmed' NOT NULL,
    "html_link" text,
    "organizer" text,
    "attendees" integer DEFAULT 0 NOT NULL,
    "etag" text,
    "google_updated_at" timestamp,
    "local_dirty" boolean DEFAULT false NOT NULL,
    "local_updated_at" timestamp,
    "task_id" uuid,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "folio_google_calendars_unique_idx" ON "folio_google_calendars" USING btree ("account_id","calendar_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_google_calendars_user_idx" ON "folio_google_calendars" USING btree ("user_id")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "folio_google_events_unique_idx" ON "folio_google_events" USING btree ("account_id","google_event_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_google_events_user_idx" ON "folio_google_events" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_google_events_task_idx" ON "folio_google_events" USING btree ("task_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_google_events_start_idx" ON "folio_google_events" USING btree ("start_at")`,
  `ALTER TABLE "folio_google_calendars" ADD COLUMN IF NOT EXISTS "description" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "folio_google_events" ADD COLUMN IF NOT EXISTS "recurring_event_id" text`,
  `ALTER TABLE "folio_google_events" ADD COLUMN IF NOT EXISTS "location" text DEFAULT '' NOT NULL`,
  `ALTER TABLE "folio_google_events" ADD COLUMN IF NOT EXISTS "organizer" text`,
  `ALTER TABLE "folio_google_events" ADD COLUMN IF NOT EXISTS "attendees" integer DEFAULT 0 NOT NULL`,
  `ALTER TABLE "folio_google_events" ADD COLUMN IF NOT EXISTS "etag" text`,
  `ALTER TABLE "folio_google_events" ADD COLUMN IF NOT EXISTS "google_updated_at" timestamp`,
  `ALTER TABLE "folio_google_events" ADD COLUMN IF NOT EXISTS "local_dirty" boolean DEFAULT false NOT NULL`,
  `ALTER TABLE "folio_google_events" ADD COLUMN IF NOT EXISTS "local_updated_at" timestamp`,
  fk("folio_sessions", "folio_sessions_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_projects", "folio_projects_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_milestones", "folio_milestones_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_milestones", "folio_milestones_project_id_folio_projects_id_fk", "project_id", "folio_projects", "cascade"),
  fk("folio_tasks", "folio_tasks_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_tasks", "folio_tasks_project_id_folio_projects_id_fk", "project_id", "folio_projects", "set null"),
  fk("folio_tasks", "folio_tasks_milestone_id_folio_milestones_id_fk", "milestone_id", "folio_milestones", "set null"),
  fk("folio_ideas", "folio_ideas_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_activities", "folio_activities_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_activities", "folio_activities_project_id_folio_projects_id_fk", "project_id", "folio_projects", "set null"),
  fk("folio_subtasks", "folio_subtasks_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_subtasks", "folio_subtasks_task_id_folio_tasks_id_fk", "task_id", "folio_tasks", "cascade"),
  fk("folio_activities", "folio_activities_task_id_folio_tasks_id_fk", "task_id", "folio_tasks", "set null"),
  fk("folio_google_accounts", "folio_google_accounts_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_google_calendars", "folio_google_calendars_account_id_folio_google_accounts_id_fk", "account_id", "folio_google_accounts", "cascade"),
  fk("folio_google_calendars", "folio_google_calendars_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_google_events", "folio_google_events_user_id_folio_users_id_fk", "user_id", "folio_users", "cascade"),
  fk("folio_google_events", "folio_google_events_account_id_folio_google_accounts_id_fk", "account_id", "folio_google_accounts", "cascade"),
  fk("folio_google_events", "folio_google_events_task_id_folio_tasks_id_fk", "task_id", "folio_tasks", "set null"),
  `CREATE INDEX IF NOT EXISTS "folio_projects_user_idx" ON "folio_projects" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_milestones_user_idx" ON "folio_milestones" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_milestones_project_idx" ON "folio_milestones" USING btree ("project_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_tasks_user_idx" ON "folio_tasks" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_ideas_user_idx" ON "folio_ideas" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_activities_user_idx" ON "folio_activities" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_activities_project_idx" ON "folio_activities" USING btree ("project_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_activities_task_idx" ON "folio_activities" USING btree ("task_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_subtasks_user_idx" ON "folio_subtasks" USING btree ("user_id")`,
  `CREATE INDEX IF NOT EXISTS "folio_subtasks_task_idx" ON "folio_subtasks" USING btree ("task_id")`,
];

const LOCK_KEY = 72_031_917;
let migration: Promise<void> | null = null;

async function run() {
  const client = await pool.connect();
  try {
    // Serialise concurrent cold starts so CREATE … IF NOT EXISTS never races.
    await client.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
    for (const statement of STATEMENTS) await client.query(statement);
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
    client.release();
  }
}

export function ensureSchema() {
  if (!migration) {
    migration = run().catch((error) => {
      migration = null;
      throw error;
    });
  }
  return migration;
}
