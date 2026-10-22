import { randomUUID } from "crypto";
import {
  db,
  events as eventsTable,
  initDb,
  predictions as predictionsTable,
} from "@puppy-track/db";
import type { EventType, PredictionFactor, PredictionStatus } from "@puppy-track/common";

export interface SeedEvent {
  type: EventType;
  occurredAt: number;
  endedAt?: number | null;
  endUnknown?: boolean;
  amount?: number | null;
  unit?: string | null;
}

export interface SeedPrediction {
  eventType: string;
  modelId?: string;
  windowStart: number;
  windowEnd: number;
  predictedAt: number;
  confidence: number;
  status: PredictionStatus;
  factors?: PredictionFactor[];
  actualEventId?: string | null;
  createdAt: number;
}

export function ensureDb(): void {
  initDb();
}

export function resetDb(): void {
  initDb();
  db.delete(eventsTable).run();
  db.delete(predictionsTable).run();
}

export function insertEvents(seed: SeedEvent[]): void {
  if (seed.length === 0) return;
  const rows = seed.map((e) => ({
    id: randomUUID(),
    type: e.type,
    userId: null,
    occurredAt: Math.round(e.occurredAt),
    endedAt: e.endedAt === undefined ? null : e.endedAt === null ? null : Math.round(e.endedAt),
    endUnknown: e.endUnknown ?? false,
    amount: e.amount ?? null,
    unit: e.unit ?? null,
    notes: null,
    metadata: null,
    createdAt: Math.round(e.occurredAt),
  }));
  // better-sqlite3 caps bound variables per statement; chunk generously.
  for (let i = 0; i < rows.length; i += 200) {
    db.insert(eventsTable)
      .values(rows.slice(i, i + 200))
      .run();
  }
}

export function insertPredictions(seed: SeedPrediction[]): void {
  for (const p of seed) {
    db.insert(predictionsTable)
      .values({
        id: randomUUID(),
        eventType: p.eventType,
        modelId: p.modelId ?? "heuristic-v0",
        windowStart: Math.round(p.windowStart),
        windowEnd: Math.round(p.windowEnd),
        predictedAt: Math.round(p.predictedAt),
        confidence: p.confidence,
        basis: p.factors ? JSON.stringify({ summary: "", signals: [], factors: p.factors }) : null,
        factors: p.factors ? JSON.stringify(p.factors) : null,
        actualEventId: p.actualEventId ?? null,
        status: p.status,
        createdAt: Math.round(p.createdAt),
      })
      .run();
  }
}

export function seedFresh(events: SeedEvent[]): void {
  resetDb();
  insertEvents(events);
}
