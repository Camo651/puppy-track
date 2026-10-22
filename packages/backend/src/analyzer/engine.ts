import { and, db, eq, events as eventsTable, gte, inArray, predictions as predictionsTable } from "@puppy-track/db";
import { type EventType, EVENT_META } from "@puppy-track/common";
import { config } from "../config";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface EventRow {
  id: string;
  type: EventType;
  occurredAt: number;
  endedAt: number | null;
}

export interface TriggerDef {
  trigger: EventType;
  target: EventType;
  maxDelay: number;
}

export interface Candidate {
  eventType: EventType;
  predictedAt: number;
  windowStart: number;
  windowEnd: number;
  confidence: number;
  basis: { summary: string; signals: string[] };
}

// Trigger -> target relationships the model looks for. The trigger time is the
// moment the trigger event "completes" (end of a nap/playtime, otherwise its start).
export const TRIGGERS: TriggerDef[] = [
  { trigger: "meal", target: "poop", maxDelay: 4 * HOUR },
  { trigger: "meal", target: "pee", maxDelay: 2 * HOUR },
  { trigger: "water", target: "pee", maxDelay: 2 * HOUR },
  { trigger: "nap", target: "pee", maxDelay: 45 * MINUTE },
  { trigger: "playtime", target: "pee", maxDelay: 45 * MINUTE },
  { trigger: "walk", target: "pee", maxDelay: 45 * MINUTE },
  { trigger: "walk", target: "poop", maxDelay: 45 * MINUTE },
];

function recencyWeight(ageMs: number): number {
  const ageDays = ageMs / DAY;
  return Math.pow(0.5, ageDays / config.analyzer.halfLifeDays);
}

function triggerTime(e: EventRow): number {
  // For a span, the "trigger" is when it ended (waking from a nap, finishing a
  // walk). If the end is unknown or still running, fall back to the start.
  if (EVENT_META[e.type].kind === "span") return e.endedAt ?? e.occurredAt;
  return e.occurredAt;
}

function weightedStats(values: number[], weights: number[]): { mean: number; std: number; nEff: number } {
  let sumW = 0;
  let sumWX = 0;
  let sumW2 = 0;
  for (let i = 0; i < values.length; i++) {
    sumW += weights[i];
    sumWX += weights[i] * values[i];
    sumW2 += weights[i] * weights[i];
  }
  if (sumW === 0) return { mean: 0, std: 0, nEff: 0 };
  const mean = sumWX / sumW;
  let sumWVar = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - mean;
    sumWVar += weights[i] * d * d;
  }
  const std = Math.sqrt(sumWVar / sumW);
  const nEff = (sumW * sumW) / sumW2;
  return { mean, std, nEff };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function minuteOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function loadEvents(sinceMs: number): EventRow[] {
  const rows = db
    .select({
      id: eventsTable.id,
      type: eventsTable.type,
      occurredAt: eventsTable.occurredAt,
      endedAt: eventsTable.endedAt,
    })
    .from(eventsTable)
    .where(gte(eventsTable.occurredAt, sinceMs))
    .all();
  return rows
    .map((r) => ({ ...r, type: r.type as EventType }))
    .sort((a, b) => a.occurredAt - b.occurredAt);
}

// Multiplier in [~0.5, 1] from recent confirm/deny feedback for this event type:
// repeated denials drag future confidence down, confirmations keep it high.
function precisionMultiplier(type: EventType, now: number): number {
  const since = now - 14 * DAY;
  const rows = db
    .select({ status: predictionsTable.status })
    .from(predictionsTable)
    .where(and(eq(predictionsTable.eventType, type), gte(predictionsTable.createdAt, since)))
    .all();
  let confirmed = 0;
  let denied = 0;
  for (const r of rows) {
    if (r.status === "confirmed") confirmed += 1;
    else if (r.status === "denied") denied += 1;
  }
  const total = confirmed + denied;
  if (total === 0) return 1;
  const precision = confirmed / total;
  return 0.5 + 0.5 * precision;
}

// How typical `at` is for `type`, as a mild multiplier around 1, from a
// recency-weighted hour-of-day histogram (circular, smoothed over +-1 hour).
function timeOfDayFactor(occurrences: { t: number; w: number }[], at: number): number {
  if (occurrences.length < 6) return 1;
  const bins = new Array(24).fill(0);
  let totalW = 0;
  for (const o of occurrences) {
    const hour = new Date(o.t).getHours();
    bins[hour] += o.w;
    bins[(hour + 23) % 24] += o.w * 0.5;
    bins[(hour + 1) % 24] += o.w * 0.5;
    totalW += o.w * 2;
  }
  if (totalW === 0) return 1;
  const avg = totalW / 24;
  const hour = new Date(at).getHours();
  const density = bins[hour] / avg;
  return clamp(density, 0.6, 1.3);
}

export function intervalCandidate(type: EventType, all: EventRow[], now: number): Candidate | null {
  const occ = all.filter((e) => e.type === type).map((e) => e.occurredAt);
  if (occ.length < 4) return null;

  const intervals: number[] = [];
  const weights: number[] = [];
  for (let i = 1; i < occ.length; i++) {
    const d = occ[i] - occ[i - 1];
    if (d <= 0 || d > 2 * DAY) continue;
    intervals.push(d);
    weights.push(recencyWeight(now - occ[i]));
  }
  if (intervals.length < 3) return null;

  const { mean, std, nEff } = weightedStats(intervals, weights);
  if (mean <= 0) return null;

  const last = occ[occ.length - 1];
  const predictedAt = last + mean;
  const cv = std / mean;
  const consistency = clamp(1 - cv, 0, 1);
  const dataFactor = nEff / (nEff + 2);

  const occWithW = all
    .filter((e) => e.type === type)
    .map((e) => ({ t: e.occurredAt, w: recencyWeight(now - e.occurredAt) }));
  const tod = timeOfDayFactor(occWithW, predictedAt);

  const confidence = clamp(consistency * dataFactor * tod, 0, 1);
  const halfWidth = clamp(std, 10 * MINUTE, 90 * MINUTE);
  const meanMin = Math.round(mean / MINUTE);

  return {
    eventType: type,
    predictedAt,
    windowStart: predictedAt - halfWidth,
    windowEnd: predictedAt + halfWidth,
    confidence,
    basis: {
      summary: `Usually every ~${meanMin} min; last one was ${Math.round((now - last) / MINUTE)} min ago.`,
      signals: [
        `interval model: mean ${meanMin} min, consistency ${(consistency * 100).toFixed(0)}%`,
        `effective samples ${nEff.toFixed(1)}`,
        `time-of-day factor ${tod.toFixed(2)}`,
      ],
    },
  };
}

export function triggerCandidate(
  def: TriggerDef,
  all: EventRow[],
  now: number,
): Candidate | null {
  const triggers = all.filter((e) => e.type === def.trigger);
  const targets = all.filter((e) => e.type === def.target).map((e) => e.occurredAt);
  if (triggers.length < 3 || targets.length < 3) return null;

  const delays: number[] = [];
  const weights: number[] = [];
  for (const trig of triggers) {
    const tt = triggerTime(trig);
    const next = targets.find((t) => t > tt && t - tt <= def.maxDelay);
    if (next === undefined) continue;
    delays.push(next - tt);
    weights.push(recencyWeight(now - next));
  }
  if (delays.length < 3) return null;

  const { mean, std, nEff } = weightedStats(delays, weights);
  if (mean <= 0) return null;

  // The most recent trigger that has not yet been followed by a target event.
  const lastTrigger = [...triggers].reverse().find((trig) => {
    const tt = triggerTime(trig);
    return !targets.some((t) => t > tt);
  });
  if (!lastTrigger) return null;

  const tt = triggerTime(lastTrigger);
  const predictedAt = tt + mean;
  const cv = std / mean;
  const consistency = clamp(1 - cv, 0, 1);
  const dataFactor = nEff / (nEff + 2);
  const confidence = clamp(consistency * dataFactor, 0, 1);
  const halfWidth = clamp(std, 10 * MINUTE, 60 * MINUTE);
  const meanMin = Math.round(mean / MINUTE);

  return {
    eventType: def.target,
    predictedAt,
    windowStart: predictedAt - halfWidth,
    windowEnd: predictedAt + halfWidth,
    confidence,
    basis: {
      summary: `Often ${EVENT_META[def.target].label.toLowerCase()}s ~${meanMin} min after a ${EVENT_META[def.trigger].label.toLowerCase()}.`,
      signals: [
        `trigger model: ${def.trigger} -> ${def.target}, mean ${meanMin} min, consistency ${(consistency * 100).toFixed(0)}%`,
        `effective samples ${nEff.toFixed(1)}`,
      ],
    },
  };
}

// Daily-routine model: many puppy events (meals, walks, naps, and the pees that
// follow them) recur at consistent times of day rather than at a single fixed
// interval. A pure interval model is defeated by multi-event days and the long
// overnight gap; this models the recurring clock time instead.
//
// Each past occurrence is mapped to "minutes until that clock time next occurs"
// relative to `now`, so just-finished events wrap to ~24h and never create a
// spurious imminent cluster. The nearest well-supported cluster of these deltas
// is the next routine occurrence.
export function recurrenceCandidate(type: EventType, all: EventRow[], now: number): Candidate | null {
  const occ = all.filter((e) => e.type === type);
  if (occ.length < 8) return null;
  const spanDays = (now - occ[0].occurredAt) / DAY;
  if (spanDays < 3) return null;

  const BIN = 15;
  const N = 1440 / BIN;
  const hist = new Array<number>(N).fill(0);
  const nowMin = (now - startOfLocalDay(now)) / MINUTE;

  interface Occ {
    delta: number; // minutes from now until this clock time next recurs
    w: number;
    day: number;
  }
  const items: Occ[] = [];
  const dayW = new Map<number, number>();
  let totalW = 0;
  for (const e of occ) {
    const w = recencyWeight(now - e.occurredAt);
    let delta = minuteOfDay(e.occurredAt) - nowMin;
    while (delta <= 0) delta += 1440;
    const day = Math.floor(startOfLocalDay(e.occurredAt) / DAY);
    items.push({ delta, w, day });
    hist[Math.min(N - 1, Math.floor(delta / BIN))] += w;
    totalW += w;
    dayW.set(day, Math.max(dayW.get(day) ?? 0, w));
  }
  if (totalW <= 0) return null;

  const sm = new Array<number>(N).fill(0);
  for (let i = 0; i < N; i++) {
    sm[i] = 0.5 * hist[i] + 0.25 * hist[(i - 1 + N) % N] + 0.25 * hist[(i + 1) % N];
  }
  const maxBin = Math.max(...sm);
  if (maxBin <= 0) return null;
  const thresh = 0.3 * maxBin;

  let peak = -1;
  for (let i = 0; i < N; i++) {
    if (sm[i] >= thresh) {
      peak = i;
      break;
    }
  }
  if (peak < 0) return null;
  let lo = peak;
  while (lo - 1 >= 0 && sm[lo - 1] >= thresh) lo--;
  let hi = peak;
  while (hi + 1 < N && sm[hi + 1] >= thresh) hi++;
  // Pad by one bin on each side so occurrences jittered just outside the
  // above-threshold core still count toward the cluster's spread and support.
  const loDelta = Math.max(0, lo - 1) * BIN;
  const hiDelta = (hi + 2) * BIN;

  const inRegion = items.filter((o) => o.delta >= loDelta && o.delta < hiDelta);
  if (inRegion.length < 3) return null;

  const { mean, std } = weightedStats(
    inRegion.map((o) => o.delta * MINUTE),
    inRegion.map((o) => o.w),
  );
  const predictedAt = now + mean;

  const regionDays = new Map<number, number>();
  for (const o of inRegion) regionDays.set(o.day, Math.max(regionDays.get(o.day) ?? 0, o.w));
  if (regionDays.size < 3) return null;
  let effDaysW = 0;
  for (const w of dayW.values()) effDaysW += w;
  let supportW = 0;
  for (const w of regionDays.values()) supportW += w;
  // How reliably this clock time recurs across days (recency-weighted).
  const regularity = clamp(effDaysW > 0 ? supportW / effDaysW : 0, 0, 1);

  const stdMin = std / MINUTE;
  // Tolerant of normal ±20-30 min routine drift; a 30-min spread still reads as
  // a dependable "around this time" pattern rather than noise.
  const concentration = clamp(1 - stdMin / 90, 0, 1);
  const confidence = clamp(concentration * regularity, 0, 1);
  const halfWidth = clamp(std, 10 * MINUTE, 90 * MINUTE);

  return {
    eventType: type,
    predictedAt,
    windowStart: predictedAt - halfWidth,
    windowEnd: predictedAt + halfWidth,
    confidence,
    basis: {
      summary: `Usually around this time of day (±${Math.round(stdMin)} min).`,
      signals: [
        `recurrence model: time-of-day cluster, spread ${Math.round(stdMin)} min`,
        `regularity ${(regularity * 100).toFixed(0)}% of days`,
        `days observed ${regionDays.size}`,
      ],
    },
  };
}

// Best prediction per event type for a set of in-memory events. The strongest
// live candidate per type wins across the interval, recurrence, and trigger
// models. An optional `adjust` multiplier (per type) folds in feedback-based
// precision; pass none for a pure, snapshot-only computation.
export function combineCandidates(
  all: EventRow[],
  now: number,
  adjust?: (type: EventType) => number,
): Candidate[] {
  const byType = new Map<EventType, Candidate>();

  const consider = (c: Candidate | null, type: EventType) => {
    if (!c) return;
    // Ignore fully stale candidates whose window has already elapsed; otherwise
    // a confident-but-past estimate can mask a live, imminent one.
    if (c.windowEnd < now) return;
    const factor = adjust ? adjust(type) : 1;
    const adjusted = { ...c, confidence: clamp(c.confidence * factor, 0, 1) };
    const existing = byType.get(type);
    if (!existing || adjusted.confidence > existing.confidence) byType.set(type, adjusted);
  };

  for (const type of ["pee", "poop", "meal", "water", "nap"] as EventType[]) {
    consider(intervalCandidate(type, all, now), type);
  }
  for (const type of ["pee", "poop", "meal", "water", "nap", "playtime", "walk", "training"] as EventType[]) {
    consider(recurrenceCandidate(type, all, now), type);
  }
  for (const def of TRIGGERS) {
    consider(triggerCandidate(def, all, now), def.target);
  }

  return [...byType.values()];
}

// Snapshot-only combination used by the heuristic-v0 model plugin.
export function computeCandidatesFromRows(all: EventRow[], now: number): Candidate[] {
  return combineCandidates(all, now);
}

// Best prediction per event type for the current moment, reading events and
// feedback from the database. Retained for the existing scheduler/tests.
export function computeCandidates(now = Date.now()): Candidate[] {
  const all = loadEvents(now - config.analyzer.lookbackDays * DAY);
  return combineCandidates(all, now, (type) => precisionMultiplier(type, now));
}

// Attach a freshly logged event to any outstanding prediction it satisfies.
export function matchEventToPredictions(eventId: string, type: EventType, occurredAt: number): number {
  const open = db
    .select()
    .from(predictionsTable)
    .where(
      and(
        eq(predictionsTable.eventType, type),
        inArray(predictionsTable.status, ["notified", "pending"]),
      ),
    )
    .all();

  const tolerance = 45 * MINUTE;
  let matched = 0;
  for (const p of open) {
    if (p.actualEventId) continue;
    const within = occurredAt >= p.windowStart - tolerance && occurredAt <= p.windowEnd + tolerance;
    if (!within) continue;
    db.update(predictionsTable)
      .set({ status: "confirmed", actualEventId: eventId, feedbackAt: Date.now() })
      .where(eq(predictionsTable.id, p.id))
      .run();
    matched += 1;
  }
  return matched;
}

// Mark predictions whose window has long passed without a logged event or user
// feedback as expired, so they stop counting as open.
export function expireStalePredictions(now = Date.now()): number {
  const grace = 2 * HOUR;
  const open = db
    .select()
    .from(predictionsTable)
    .where(inArray(predictionsTable.status, ["notified", "pending"]))
    .all();
  let expired = 0;
  for (const p of open) {
    if (p.actualEventId) continue;
    if (p.windowEnd < now - grace) {
      db.update(predictionsTable)
        .set({ status: "expired" })
        .where(eq(predictionsTable.id, p.id))
        .run();
      expired += 1;
    }
  }
  return expired;
}
