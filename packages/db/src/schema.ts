import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  globalName: text("global_name"),
  avatar: text("avatar"),
  createdAt: integer("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  createdAt: integer("created_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
  lastSeen: integer("last_seen").notNull(),
});

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    type: text("type").notNull(),
    userId: text("user_id").references(() => users.id),
    occurredAt: integer("occurred_at").notNull(),
    endedAt: integer("ended_at"),
    endUnknown: integer("end_unknown", { mode: "boolean" }).notNull().default(false),
    amount: real("amount"),
    unit: text("unit"),
    notes: text("notes"),
    metadata: text("metadata"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    byTypeOccurred: index("events_type_occurred_idx").on(t.type, t.occurredAt),
    byOccurred: index("events_occurred_idx").on(t.occurredAt),
  }),
);

export const predictions = sqliteTable(
  "predictions",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    modelId: text("model_id").notNull().default("heuristic-v0"),
    windowStart: integer("window_start").notNull(),
    windowEnd: integer("window_end").notNull(),
    predictedAt: integer("predicted_at").notNull(),
    confidence: real("confidence").notNull(),
    basis: text("basis"),
    context: text("context"),
    factors: text("factors"),
    sourceEventId: text("source_event_id"),
    status: text("status").notNull().default("pending"),
    actualEventId: text("actual_event_id"),
    notifiedAt: integer("notified_at"),
    feedbackAt: integer("feedback_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    byCreated: index("predictions_created_idx").on(t.createdAt),
    byTypeStatus: index("predictions_type_status_idx").on(t.eventType, t.status),
    byModelCreated: index("predictions_model_created_idx").on(t.modelId, t.createdAt),
    byModelTypeStatus: index("predictions_model_type_status_idx").on(
      t.modelId,
      t.eventType,
      t.status,
    ),
  }),
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const schema = { users, sessions, events, predictions, pushSubscriptions, settings };
export type Schema = typeof schema;

export { sql };
