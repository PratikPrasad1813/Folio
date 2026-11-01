import { pgTable, uuid, text, timestamp, boolean, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("folio_users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  provider: text("provider").notNull().default("email"),
  weeklyGoal: integer("weekly_goal").notNull().default(12),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessions = pgTable("folio_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
});

export const projects = pgTable("folio_projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  status: text("status").notNull().default("Planning"),
  priority: text("priority").notNull().default("Medium"),
  color: text("color").notNull().default("violet"),
  icon: text("icon").notNull().default("layout"),
  category: text("category").notNull().default("Personal"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  favorite: boolean("favorite").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("folio_projects_user_idx").on(table.userId)]);

// Milestones split a project into meaningful checkpoints. Tasks can optionally
// belong to one, which is what drives each milestone's progress indicator.
export const milestones = pgTable("folio_milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  dueDate: text("due_date"),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("folio_milestones_user_idx").on(table.userId),
  index("folio_milestones_project_idx").on(table.projectId),
]);

export const tasks = pgTable("folio_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  // Workflow status: todo | in_progress | in_review | done. `completed` is kept
  // in sync (completed ⇔ status = 'done') so existing readers keep working.
  status: text("status").notNull().default("todo"),
  completed: boolean("completed").notNull().default(false),
  // Urgent | High | Medium | Low | None (the original three values remain valid).
  priority: text("priority").notNull().default("Medium"),
  startDate: text("start_date"),
  dueDate: text("due_date"),
  // No DB default on purpose (drizzle-kit mis-compares array defaults on every push);
  // every insert sets labels explicitly, and the migration backfills existing rows.
  labels: text("labels").array().notNull(),
  estimateMinutes: integer("estimate_minutes"),
  notes: text("notes").notNull().default(""),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [index("folio_tasks_user_idx").on(table.userId)]);

// Subtasks break a task into small, checkable steps. They belong to exactly one
// task and disappear with it.
export const subtasks = pgTable("folio_subtasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  completedAt: timestamp("completed_at"),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("folio_subtasks_user_idx").on(table.userId),
  index("folio_subtasks_task_idx").on(table.taskId),
]);

// --- Google Calendar integration -----------------------------------------
// One Google account per Folio user. Tokens are encrypted at rest with
// AES-256-GCM (see src/lib/crypto.ts) and are never sent to the browser.
export const googleAccounts = pgTable("folio_google_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  googleUserId: text("google_user_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  picture: text("picture"),
  // OAuth credentials, encrypted. The refresh token is the long-lived secret.
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  scopes: text("scopes").array().notNull().default([]),
  // Write access is a separate, incrementally-granted scope (calendar.events).
  writeEnabled: boolean("write_enabled").notNull().default(false),
  connectionError: text("connection_error"),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status").notNull().default("never"),
  lastSyncDetail: jsonb("last_sync_detail"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [uniqueIndex("folio_google_accounts_user_idx").on(table.userId)]);

// Per-calendar sync state: which calendars Folio reads, and how far it has caught up.
export const googleCalendars = pgTable("folio_google_calendars", {
  id: uuid("id").defaultRandom().primaryKey(),
  accountId: uuid("account_id").notNull().references(() => googleAccounts.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  calendarId: text("calendar_id").notNull(),
  summary: text("summary").notNull().default(""),
  description: text("description").notNull().default(""),
  backgroundColor: text("background_color"),
  primary: boolean("primary").notNull().default(false),
  // `selected` mirrors Google's own calendar-list flag; `visible` is Folio's display toggle.
  selected: boolean("selected").notNull().default(true),
  visible: boolean("visible").notNull().default(true),
  syncToken: text("sync_token"),
  lastSyncedAt: timestamp("last_synced_at"),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("folio_google_calendars_unique_idx").on(table.accountId, table.calendarId),
  index("folio_google_calendars_user_idx").on(table.userId),
]);

// Mirror of Google events, plus the stable link to a Folio task.
export const googleEvents = pgTable("folio_google_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accountId: uuid("account_id").notNull().references(() => googleAccounts.id, { onDelete: "cascade" }),
  calendarId: text("calendar_id").notNull(),
  googleEventId: text("google_event_id").notNull(),
  recurringEventId: text("recurring_event_id"),
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  location: text("location").notNull().default(""),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  allDay: boolean("all_day").notNull().default(false),
  timezone: text("timezone"),
  status: text("status").notNull().default("confirmed"),
  htmlLink: text("html_link"),
  organizer: text("organizer"),
  attendees: integer("attendees").notNull().default(0),
  etag: text("etag"),
  googleUpdatedAt: timestamp("google_updated_at"),
  // Set while Folio holds an unpushed edit, so a later sync can detect a conflict
  // instead of silently overwriting either side.
  localDirty: boolean("local_dirty").notNull().default(false),
  localUpdatedAt: timestamp("local_updated_at"),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  // Guarantees one mirror row per Google event: the idempotency key for sync.
  uniqueIndex("folio_google_events_unique_idx").on(table.accountId, table.googleEventId),
  index("folio_google_events_user_idx").on(table.userId),
  index("folio_google_events_task_idx").on(table.taskId),
  index("folio_google_events_start_idx").on(table.startAt),
]);

export const ideas = pgTable("folio_ideas", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("Personal"),
  color: text("color").notNull().default("yellow"),
  status: text("status").notNull().default("Just an idea"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("folio_ideas_user_idx").on(table.userId)]);

export const activities = pgTable("folio_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Project-scoped events keep a link so each project has its own history.
  // When a project is deleted the event survives in the global feed.
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  // Task-scoped events power each task's history in the details panel.
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  text: text("text").notNull(),
  type: text("type").notNull().default("project"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("folio_activities_user_idx").on(table.userId),
  index("folio_activities_project_idx").on(table.projectId),
  index("folio_activities_task_idx").on(table.taskId),
]);
