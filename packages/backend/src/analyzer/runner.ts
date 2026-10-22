import { randomUUID } from "crypto";
import {
  and,
  db,
  eq,
  events as eventsTable,
  gt,
  gte,
  inArray,
  predictions as predictionsTable,
} from "@puppy-track/db";
import { TARGET_META, type EventType, type PredictionTarget } from "@puppy-track/common";
import { config } from "../config";
import { areaLog, serializeError } from "../logger";
import { sendToAll } from "../push/webpush";
import { getChampionId } from "./champion";
import { modelRegistry } from "./models";
import type { EventSnapshot, ModelPrediction } from "./models";
import { expireAll } from "./resolver";

const log = areaLog("analyzer");
const DAY = 24 * 60 * 60_000;

function puppyName(): string {
  return config.puppy.name.trim() || "Your puppy";
}

export function loadSnapshot(now: number): EventSnapshot {
  const since = now - config.analyzer.lookbackDays * DAY;
  const rows = db
    .select({
      id: eventsTable.id,
      type: eventsTable.type,
      occurredAt: eventsTable.occurredAt,
      endedAt: eventsTable.endedAt,
      amount: eventsTable.amount,
    })
    .from(eventsTable)
    .where(gte(eventsTable.occurredAt, since))
    .all();
  const events = rows
    .map((r) => ({ ...r, type: r.type as EventType }))
    .sort((a, b) => a.occurredAt - b.occurredAt);
  return { events, now };
}

function hasOpenPrediction(modelId: string, target: PredictionTarget, now: number): boolean {
  const rows = db
    .select({ id: predictionsTable.id })
    .from(predictionsTable)
    .where(
      and(
        eq(predictionsTable.modelId, modelId),
        eq(predictionsTable.eventType, target),
        inArray(predictionsTable.status, ["notified", "pending"]),
        gt(predictionsTable.windowEnd, now),
      ),
    )
    .all();
  return rows.length > 0;
}

function insertPrediction(modelId: string, p: ModelPrediction, now: number): string {
  const id = randomUUID();
  db.insert(predictionsTable)
    .values({
      id,
      eventType: p.target,
      modelId,
      windowStart: Math.round(p.windowStart),
      windowEnd: Math.round(p.windowEnd),
      predictedAt: Math.round(p.predictedAt),
      confidence: p.probability,
      basis: JSON.stringify({ summary: p.summary, signals: [], factors: p.factors, evidence: p.evidence }),
      context: p.context ? JSON.stringify(p.context) : null,
      factors: JSON.stringify(p.factors),
      sourceEventId: p.sourceEventId ?? null,
      status: "pending",
      createdAt: now,
    })
    .run();
  return id;
}

async function notifyChampion(id: string, p: ModelPrediction, now: number): Promise<void> {
  db.update(predictionsTable)
    .set({ status: "notified", notifiedAt: now })
    .where(eq(predictionsTable.id, id))
    .run();

  const etaMin = Math.round((p.predictedAt - now) / 60_000);
  const eta = etaMin > 1 ? `in ~${etaMin} min` : "about now";
  const reason = p.factors
    .slice(0, 2)
    .map((f) => f.label)
    .join(" + ");
  const body = reason ? `${eta} - because ${reason}.` : `${eta}. ${p.summary}`;

  const sent = await sendToAll({
    title: `${puppyName()} ${TARGET_META[p.target].verb}`,
    body,
    url: "/notifications",
    tag: `pred-${p.target}`,
  });

  log.info("prediction notified", {
    model: "champion",
    target: p.target,
    confidence: Number(p.probability.toFixed(2)),
    etaMin,
    pushSent: sent,
  });
}

// One analyzer cycle: expire stale predictions, snapshot the event stream, run
// every model, persist their forecasts tagged by model, and let only the
// champion notify imminent, confident forecasts.
export async function runOnce(now = Date.now()): Promise<void> {
  try {
    expireAll(now);
    const snap = loadSnapshot(now);
    const championId = getChampionId();
    const leadMs = config.analyzer.leadMinutes * 60_000;

    for (const model of modelRegistry) {
      let preds: ModelPrediction[];
      try {
        preds = model.predict(snap);
      } catch (e) {
        log.error("model failed", { model: model.id, err: serializeError(e) });
        continue;
      }
      for (const p of preds) {
        if (hasOpenPrediction(model.id, p.target, now)) continue;
        const id = insertPrediction(model.id, p, now);
        const imminent = p.predictedAt - now <= leadMs && p.windowEnd >= now;
        if (
          model.id === championId &&
          imminent &&
          p.probability >= config.analyzer.confidenceThreshold
        ) {
          await notifyChampion(id, p, now);
        }
      }
    }
  } catch (e) {
    log.error("analyzer run failed", { err: serializeError(e) });
  }
}
