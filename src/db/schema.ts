import { pgTable, uuid, text, timestamp, boolean, integer, index } from "drizzle-orm/pg-core";

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
  dueDate: text("due_date"),
  favorite: boolean("favorite").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("folio_projects_user_idx").on(table.userId)]);

export const tasks = pgTable("folio_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  completed: boolean("completed").notNull().default(false),
  priority: text("priority").notNull().default("Medium"),
  dueDate: text("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("folio_tasks_user_idx").on(table.userId)]);

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
  text: text("text").notNull(),
  type: text("type").notNull().default("project"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [index("folio_activities_user_idx").on(table.userId)]);
