import { and, db, desc, eq, inArray, lt, predictions as predictionsTable } from "@puppy-track/db";
import { DEFAULT_ENERGY, type PredictionTarget } from "@puppy-track/common";
import { events as eventsTable } from "@puppy-track/db";

const MIN = 60_000;
const HOUR = 60 * MIN;
const TOL = 45 * MIN;
const GRACE = 2 * HOUR;

export interface LoggedEvent {
  id: string;
  type: string;
  occurredAt: number;
  amount?: number | null;
}

// Which targets a freshly logged event satisfies. Energy events are compared to
// the previous energy reading to detect a crossing into high (>=4) or low (<=1).
export function targetsForEvent(e: LoggedEvent): PredictionTarget[] {
  if (e.type === "pee") return ["pee"];
  if (e.type === "poop") return ["poop"];
  if (e.type === "nap") return ["nap"];
  if (e.type === "energy") {
    const prevRow = db
      .select({ amount: eventsTable.amount })
      .from(eventsTable)
      .where(and(eq(eventsTable.type, "energy"), lt(eventsTable.occurredAt, e.occurredAt)))
      .orderBy(desc(eventsTable.occurredAt))
      .limit(1)
      .all()[0];
    const prev = prevRow?.amount ?? DEFAULT_ENERGY;
    const cur = e.amount ?? DEFAULT_ENERGY;
    const out: PredictionTarget[] = [];
    if (prev < 4 && cur >= 4) out.push("energy_high");
    if (prev > 1 && cur <= 1) out.push("energy_low");
    return out;
  }
  return [];
}

// Confirm every model's open prediction that this real event satisfies.
// Resolution is objective and model-agnostic.
export function matchAll(e: LoggedEvent): number {
  let matched = 0;
  for (const target of targetsForEvent(e)) {
    const open = db
      .select()
      .from(predictionsTable)
      .where(
        and(
          eq(predictionsTable.eventType, target),
          inArray(predictionsTable.status, ["notified", "pending"]),
        ),
      )
      .all();
    for (const p of open) {
      if (p.actualEventId) continue;
      if (e.occurredAt >= p.windowStart - TOL && e.occurredAt <= p.windowEnd + TOL) {
        db.update(predictionsTable)
          .set({ status: "confirmed", actualEventId: e.id, feedbackAt: Date.now() })
          .where(eq(predictionsTable.id, p.id))
          .run();
        matched += 1;
      }
    }
  }
  return matched;
}

// Mark long-past open predictions (any model) as expired misses.
export function expireAll(now = Date.now()): number {
  const open = db
    .select()
    .from(predictionsTable)
    .where(inArray(predictionsTable.status, ["notified", "pending"]))
    .all();
  let expired = 0;
  for (const p of open) {
    if (p.actualEventId) continue;
    if (p.windowEnd < now - GRACE) {
      db.update(predictionsTable).set({ status: "expired" }).where(eq(predictionsTable.id, p.id)).run();
      expired += 1;
    }
  }
  return expired;
}
