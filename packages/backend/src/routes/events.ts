import { randomUUID } from "crypto";
import { Router } from "express";
import { and, db, desc, eq, events as eventsTable, gte, inArray, isNull } from "@puppy-track/db";
import {
  createEventSchema,
  EVENT_TYPES,
  isSpanType,
  updateEventSchema,
  type EventType,
} from "@puppy-track/common";
import { requireUser } from "../middleware/auth";
import { serializeEvent } from "../serialize";
import { onEventLogged } from "../analyzer/scheduler";

export const eventsRouter = Router();

const SPAN_TYPES = EVENT_TYPES.filter(isSpanType) as string[];

// A span is active when it has started, has no end time, and is not marked
// end-unknown. Only one such span may exist at a time.
function activeSpanExists(): boolean {
  const rows = db
    .select({ id: eventsTable.id })
    .from(eventsTable)
    .where(
      and(
        inArray(eventsTable.type, SPAN_TYPES),
        isNull(eventsTable.endedAt),
        eq(eventsTable.endUnknown, false),
      ),
    )
    .limit(1)
    .all();
  return rows.length > 0;
}

eventsRouter.get("/events", requireUser, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const since = Number(req.query.since);
  const type = typeof req.query.type === "string" ? req.query.type : undefined;

  const filters = [];
  if (Number.isFinite(since)) filters.push(gte(eventsTable.occurredAt, since));
  if (type && (EVENT_TYPES as readonly string[]).includes(type)) filters.push(eq(eventsTable.type, type));

  const rows = db
    .select()
    .from(eventsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(eventsTable.occurredAt))
    .limit(limit)
    .all();

  res.json({ events: rows.map(serializeEvent) });
});

eventsRouter.post("/events", requireUser, (req, res) => {
  const parsed = createEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const now = Date.now();
  const data = parsed.data;

  const startsRunningSpan =
    isSpanType(data.type) && (data.endedAt === null || data.endedAt === undefined) && !data.endUnknown;
  if (startsRunningSpan && activeSpanExists()) {
    res.status(409).json({ error: "span_already_active" });
    return;
  }

  const id = randomUUID();
  const occurredAt = data.occurredAt ?? now;

  db.insert(eventsTable)
    .values({
      id,
      type: data.type,
      userId: req.user!.id,
      occurredAt,
      endedAt: data.endedAt ?? null,
      endUnknown: data.endUnknown ?? false,
      amount: data.amount ?? null,
      unit: data.unit ?? null,
      notes: data.notes ?? null,
      metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      createdAt: now,
    })
    .run();

  const row = db.select().from(eventsTable).where(eq(eventsTable.id, id)).all()[0];
  onEventLogged(id, data.type as EventType, occurredAt, data.amount ?? null);
  res.status(201).json({ event: serializeEvent(row) });
});

eventsRouter.patch("/events/:id", requireUser, (req, res) => {
  const parsed = updateEventSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
    return;
  }
  const id = req.params.id;
  const existing = db.select().from(eventsTable).where(eq(eventsTable.id, id)).all()[0];
  if (!existing) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  const d = parsed.data;
  db.update(eventsTable)
    .set({
      ...(d.type !== undefined ? { type: d.type } : {}),
      ...(d.occurredAt !== undefined ? { occurredAt: d.occurredAt } : {}),
      ...(d.endedAt !== undefined ? { endedAt: d.endedAt } : {}),
      ...(d.endUnknown !== undefined ? { endUnknown: d.endUnknown } : {}),
      ...(d.amount !== undefined ? { amount: d.amount } : {}),
      ...(d.unit !== undefined ? { unit: d.unit } : {}),
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
      ...(d.metadata !== undefined ? { metadata: d.metadata ? JSON.stringify(d.metadata) : null } : {}),
    })
    .where(eq(eventsTable.id, id))
    .run();

  const row = db.select().from(eventsTable).where(eq(eventsTable.id, id)).all()[0];
  res.json({ event: serializeEvent(row) });
});

eventsRouter.delete("/events/:id", requireUser, (req, res) => {
  db.delete(eventsTable).where(eq(eventsTable.id, req.params.id)).run();
  res.json({ ok: true });
});
