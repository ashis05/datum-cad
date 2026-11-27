// Neon Postgres schema (Drizzle). Auth tables follow the @auth/drizzle-adapter
// defaults; `user.tier` is ours. Migrations live in /drizzle (drizzle-kit).

import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
import type { Snapshot } from "@/lib/api";

/** Rate-limit tier. "pro" is assigned by hand (SQL) for trusted users. */
export type Tier = "free" | "pro";

// ── Auth.js ────────────────────────────────────────────────────────────────

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  tier: text("tier").$type<Tier>().notNull().default("free"),
  disabled: boolean("disabled").notNull().default(false),
  createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// Unused with the JWT session strategy, but kept so the adapter's shape is complete.
export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ── Rate limiting ──────────────────────────────────────────────────────────

/**
 * Fixed-window counters shared by every serverless instance.
 * key    = "user:<id>" | "ip:<addr>"
 * window = "minute" | "day"
 */
export const rateLimits = pgTable(
  "rate_limit",
  {
    key: text("key").notNull(),
    window: text("window").$type<"minute" | "day">().notNull(),
    windowStart: timestamp("windowStart", { mode: "date", withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.window] }), index("rate_limit_window_start_idx").on(t.windowStart)],
);

// ── Chat history ───────────────────────────────────────────────────────────

export const conversations = pgTable(
  "conversation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("conversation_user_updated_idx").on(t.userId, t.updatedAt)],
);

export const messages = pgTable(
  "message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    notes: text("notes"),
    error: text("error"),
    corrected: boolean("corrected").notNull().default(false),
    snapshot: jsonb("snapshot").$type<Snapshot>(),
    createdAt: timestamp("createdAt", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("message_conversation_created_idx").on(t.conversationId, t.createdAt)],
);
