import type { EventType, PredictionTarget } from "@puppy-track/common";
import {
  computeCandidates,
  intervalCandidate,
  recurrenceCandidate,
  triggerCandidate,
  TRIGGERS,
  type Candidate,
  type EventRow,
} from "../../src/analyzer/engine";
import type { EventSnapshot, ModelPrediction, PredictionModel } from "../../src/analyzer/models";
import { config } from "../../src/config";
import { resetDb, seedFresh, type SeedEvent } from "./db";

const MIN = 60_000;

export const THRESHOLD = config.analyzer.confidenceThreshold;
export const LEAD_MS = config.analyzer.leadMinutes * MIN;

/**
 * The live system never sees the future: it only has events logged so far. This
 * reproduces that by keeping events at or before `now` and treating any span
 * whose end is still in the future as "in progress" (endedAt cleared).
 */
export function snapshotAt(events: SeedEvent[], now: number): SeedEvent[] {
  const out: SeedEvent[] = [];
  for (const e of events) {
    if (e.occurredAt > now) continue;
    const ended = e.endedAt != null && e.endedAt <= now ? e.endedAt : null;
    out.push({ ...e, endedAt: ended });
  }
  return out;
}

/** Snapshot as in-memory EventRow[] for unit-testing the model functions. */
export function rowsAt(events: SeedEvent[], now: number): EventRow[] {
  return snapshotAt(events, now)
    .map((e, i) => ({
      id: `e${i}`,
      type: e.type,
      occurredAt: e.occurredAt,
      endedAt: e.endedAt ?? null,
    }))
    .sort((a, b) => a.occurredAt - b.occurredAt);
}

/** Seed the snapshot and return the analyzer's candidate for one type, if any. */
export function candidateAt(
  events: SeedEvent[],
  now: number,
  type: EventType,
): Candidate | null {
  seedFresh(snapshotAt(events, now));
  return computeCandidates(now).find((c) => c.eventType === type) ?? null;
}

/** All candidates the analyzer produces for the snapshot at `now`. */
export function candidatesAt(events: SeedEvent[], now: number): Candidate[] {
  seedFresh(snapshotAt(events, now));
  return computeCandidates(now);
}

/**
 * Every candidate any model would form for `type` at `now` (no winner-takes-all
 * collapsing). Used to measure the engine's capability to anticipate an event,
 * separately from what it ultimately chooses to notify. Runs purely in memory.
 */
export function modelCandidatesForType(
  events: SeedEvent[],
  now: number,
  type: EventType,
): Candidate[] {
  const rows = rowsAt(events, now);
  const out: Candidate[] = [];
  const interval = intervalCandidate(type, rows, now);
  if (interval) out.push(interval);
  const recurrence = recurrenceCandidate(type, rows, now);
  if (recurrence) out.push(recurrence);
  for (const def of TRIGGERS) {
    if (def.target !== type) continue;
    const c = triggerCandidate(def, rows, now);
    if (c) out.push(c);
  }
  return out;
}

function wouldNotify(c: Candidate, now: number, threshold = THRESHOLD): boolean {
  const imminent = c.predictedAt - now <= LEAD_MS && c.windowEnd >= now;
  return imminent && c.confidence >= threshold;
}

/** Build the in-memory snapshot a model sees at `now` (events at/before now). */
export function modelSnapshot(events: SeedEvent[], now: number): EventSnapshot {
  const rows = snapshotAt(events, now)
    .map((e, i) => ({
      id: `e${i}`,
      type: e.type,
      occurredAt: e.occurredAt,
      endedAt: e.endedAt ?? null,
      amount: e.amount ?? null,
    }))
    .sort((a, b) => a.occurredAt - b.occurredAt);
  return { events: rows, now };
}

/**
 * Run a model at `now` against the snapshot. Clears the predictions table first
 * so factor-reliability starts neutral (unless a test seeds it deliberately).
 */
export function predictWith(model: PredictionModel, events: SeedEvent[], now: number): ModelPrediction[] {
  resetDb();
  return model.predict(modelSnapshot(events, now));
}

/** A model's prediction for one target at `now`, if any. */
export function modelPrediction(
  model: PredictionModel,
  events: SeedEvent[],
  now: number,
  target: PredictionTarget,
): ModelPrediction | null {
  return predictWith(model, events, now).find((p) => p.target === target) ?? null;
}

export interface RecallResult {
  type: EventType;
  total: number;
  // Winner-takes-all: did the single prediction the app would show cover it?
  notifyHits: number;
  notifyRecall: number;
  // Capability: did ANY model confidently anticipate it?
  capabilityHits: number;
  capabilityRecall: number;
  meanConfidence: number;
  meanAbsErrorMin: number;
}

/**
 * For every real event of `type` in [from, to], probe the analyzer shortly
 * before it happened. Report two recalls: what the app would actually notify
 * (winner), and what the engine was capable of anticipating (any model).
 */
export function backtestRecall(
  events: SeedEvent[],
  opts: { type: EventType; from: number; to: number; probeLeadMs?: number; threshold?: number },
): RecallResult {
  const probeLead = opts.probeLeadMs ?? 5 * MIN;
  const threshold = opts.threshold ?? THRESHOLD;
  const actual = events
    .filter((e) => e.type === opts.type && e.occurredAt >= opts.from && e.occurredAt <= opts.to)
    .map((e) => e.occurredAt);

  const covers = (c: Candidate, t: number): boolean =>
    c.windowStart <= t && t <= c.windowEnd && c.confidence >= threshold;

  let notifyHits = 0;
  let capabilityHits = 0;
  let confSum = 0;
  let errSum = 0;
  for (const t of actual) {
    const now = t - probeLead;

    const winner = candidateAt(events, now, opts.type);
    if (winner && covers(winner, t)) notifyHits += 1;

    const all = modelCandidatesForType(events, now, opts.type).filter((c) => covers(c, t));
    if (all.length > 0) {
      capabilityHits += 1;
      const best = all.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
      confSum += best.confidence;
      errSum += Math.abs(best.predictedAt - t) / MIN;
    }
  }
  return {
    type: opts.type,
    total: actual.length,
    notifyHits,
    notifyRecall: actual.length ? notifyHits / actual.length : 0,
    capabilityHits,
    capabilityRecall: actual.length ? capabilityHits / actual.length : 0,
    meanConfidence: capabilityHits ? confSum / capabilityHits : 0,
    meanAbsErrorMin: capabilityHits ? errSum / capabilityHits : 0,
  };
}

export interface PrecisionResult {
  type: EventType;
  alerts: number;
  truePositives: number;
  precision: number;
}

/**
 * Sweep `now` across [from, to] on a grid. Every time the analyzer would fire a
 * notification, collapse repeated fires that point at the same upcoming moment,
 * then check whether a matching real event actually occurred near that window.
 */
export function backtestPrecision(
  events: SeedEvent[],
  opts: {
    from: number;
    to: number;
    stepMin?: number;
    types: EventType[];
    toleranceMs?: number;
    threshold?: number;
    // Optional [startHour, endHour) local-hour window to sweep (e.g. awake
    // hours), so idle overnight stretches do not distort precision.
    awakeHours?: [number, number];
  },
): { perType: Map<EventType, PrecisionResult>; overall: PrecisionResult } {
  const step = (opts.stepMin ?? 15) * MIN;
  const tolerance = opts.toleranceMs ?? 45 * MIN;
  const threshold = opts.threshold ?? THRESHOLD;
  const inAwakeWindow = (now: number): boolean => {
    if (!opts.awakeHours) return true;
    const h = new Date(now).getHours();
    return h >= opts.awakeHours[0] && h < opts.awakeHours[1];
  };

  interface Alert {
    predictedAt: number;
    windowEnd: number;
    firstNow: number;
  }
  const alertsByType = new Map<EventType, Alert[]>();
  for (const type of opts.types) alertsByType.set(type, []);

  for (let now = opts.from; now <= opts.to; now += step) {
    if (!inAwakeWindow(now)) continue;
    const candidates = candidatesAt(events, now);
    for (const c of candidates) {
      if (!opts.types.includes(c.eventType)) continue;
      if (!wouldNotify(c, now, threshold)) continue;
      const list = alertsByType.get(c.eventType)!;
      const last = list[list.length - 1];
      // Collapse consecutive fires aimed at the same predicted moment (the live
      // scheduler suppresses these via an already-open prediction).
      if (last && Math.abs(last.predictedAt - c.predictedAt) < 30 * MIN) {
        last.windowEnd = Math.max(last.windowEnd, c.windowEnd);
      } else {
        list.push({ predictedAt: c.predictedAt, windowEnd: c.windowEnd, firstNow: now });
      }
    }
  }

  const perType = new Map<EventType, PrecisionResult>();
  let totalAlerts = 0;
  let totalTp = 0;
  for (const type of opts.types) {
    const real = events.filter((e) => e.type === type).map((e) => e.occurredAt);
    const alerts = alertsByType.get(type)!;
    let tp = 0;
    for (const a of alerts) {
      const hit = real.some((t) => t >= a.firstNow && t <= a.windowEnd + tolerance);
      if (hit) tp += 1;
    }
    perType.set(type, {
      type,
      alerts: alerts.length,
      truePositives: tp,
      precision: alerts.length ? tp / alerts.length : 1,
    });
    totalAlerts += alerts.length;
    totalTp += tp;
  }

  return {
    perType,
    overall: {
      type: "pee",
      alerts: totalAlerts,
      truePositives: totalTp,
      precision: totalAlerts ? totalTp / totalAlerts : 1,
    },
  };
}
