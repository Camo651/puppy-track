import {
  and,
  db,
  eq,
  events as eventsTable,
  gte,
  inArray,
  predictions as predictionsTable,
} from "@puppy-track/db";
import {
  PREDICTION_TARGETS,
  type ModelScore,
  type ModelScoreMetric,
  type PredictionTarget,
} from "@puppy-track/common";
import { config } from "../../config";
import { energyCrossingTimes } from "../targets";
import { scorerRegistry } from "./index";
import type { RealTargetEvent, ResolvedPrediction } from "./types";

const DAY = 24 * 60 * 60_000;

function outcomeOf(status: string): ResolvedPrediction["outcome"] {
  if (status === "confirmed") return "hit";
  if (status === "denied" || status === "expired") return "miss";
  return "pending";
}

function loadRealTargetEvents(since: number, now: number): RealTargetEvent[] {
  const rows = db
    .select({
      type: eventsTable.type,
      occurredAt: eventsTable.occurredAt,
      amount: eventsTable.amount,
    })
    .from(eventsTable)
    .where(gte(eventsTable.occurredAt, since))
    .all()
    .filter((r) => r.occurredAt <= now);

  const out: RealTargetEvent[] = [];
  for (const r of rows) {
    if (r.type === "pee" || r.type === "poop" || r.type === "nap") {
      out.push({ target: r.type as PredictionTarget, at: r.occurredAt });
    }
  }
  const crossings = energyCrossingTimes(rows);
  for (const at of crossings.high) out.push({ target: "energy_high", at });
  for (const at of crossings.low) out.push({ target: "energy_low", at });
  return out;
}

// Score one model over the rolling scoring window: run every scorer overall and
// per target.
export function scoreModel(modelId: string, now = Date.now()): ModelScore {
  const since = now - config.analyzer.scoringWindowDays * DAY;
  const rows = db
    .select()
    .from(predictionsTable)
    .where(and(eq(predictionsTable.modelId, modelId), gte(predictionsTable.createdAt, since)))
    .all();

  // Resolve actual times for hits so lead time can be measured.
  const actualIds = rows.map((r) => r.actualEventId).filter((id): id is string => !!id);
  const actualAt = new Map<string, number>();
  if (actualIds.length) {
    const evs = db
      .select({ id: eventsTable.id, occurredAt: eventsTable.occurredAt })
      .from(eventsTable)
      .where(inArray(eventsTable.id, actualIds))
      .all();
    for (const e of evs) actualAt.set(e.id, e.occurredAt);
  }

  const resolved: ResolvedPrediction[] = rows.map((r) => ({
    target: r.eventType as PredictionTarget,
    probability: r.confidence,
    createdAt: r.createdAt,
    predictedAt: r.predictedAt,
    windowStart: r.windowStart,
    windowEnd: r.windowEnd,
    outcome: outcomeOf(r.status),
    actualAt: r.actualEventId ? actualAt.get(r.actualEventId) ?? null : null,
  }));

  const realEvents = loadRealTargetEvents(since, now);

  const overall: ModelScoreMetric[] = scorerRegistry.map((s) => s.score(resolved, realEvents));
  const perTarget: Record<string, ModelScoreMetric[]> = {};
  for (const target of PREDICTION_TARGETS) {
    const rp = resolved.filter((r) => r.target === target);
    const re = realEvents.filter((e) => e.target === target);
    if (rp.length === 0 && re.length === 0) continue;
    perTarget[target] = scorerRegistry.map((s) => s.score(rp, re));
  }

  return { modelId, perTarget, overall, sampleSize: resolved.length };
}
