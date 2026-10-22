import { DEFAULT_ENERGY } from "@puppy-track/common";
import { config } from "../../../config";
import type { EventRow } from "../types";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function recencyWeight(ageMs: number): number {
  const ageDays = ageMs / DAY;
  return Math.pow(0.5, ageDays / config.analyzer.halfLifeDays);
}

export function weightedMean(values: number[], weights: number[]): number {
  let sw = 0;
  let swx = 0;
  for (let i = 0; i < values.length; i++) {
    sw += weights[i];
    swx += weights[i] * values[i];
  }
  return sw > 0 ? swx / sw : 0;
}

export function weightedStd(values: number[], weights: number[], mean: number): number {
  let sw = 0;
  let swv = 0;
  for (let i = 0; i < values.length; i++) {
    sw += weights[i];
    const d = values[i] - mean;
    swv += weights[i] * d * d;
  }
  return sw > 0 ? Math.sqrt(swv / sw) : 0;
}

export function weightedMedian(values: number[], weights: number[]): number {
  if (values.length === 0) return 0;
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return values[idx[Math.floor(idx.length / 2)]];
  let acc = 0;
  for (const i of idx) {
    acc += weights[i];
    if (acc >= total / 2) return values[i];
  }
  return values[idx[idx.length - 1]];
}

// Numeric features used both for instance similarity and hazard pressures.
export const FEATURE_KEYS = [
  "sinceLastPee",
  "sinceLastPoop",
  "sinceLastMeal",
  "sinceLastWater",
  "sinceLastNapEnd",
  "sinceLastWalkEnd",
  "sinceLastPlayEnd",
  "sinceLastTrainingEnd",
  "waterSinceLastPee",
  "activeMinutesSinceLastPee",
  "mealsSinceLastPoop",
  "foodSinceLastPoop",
  "awakeMinutes",
  "playMinutesSinceWake",
  "energyNow",
  "energyTrend",
  "minutesSinceEnergyHigh",
  "minutesSinceEnergyLow",
  "minuteOfDay",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

// Divisors that bring each feature to roughly unit scale for the distance metric.
export const FEATURE_SCALE: Record<FeatureKey, number> = {
  sinceLastPee: 60,
  sinceLastPoop: 60,
  sinceLastMeal: 60,
  sinceLastWater: 60,
  sinceLastNapEnd: 60,
  sinceLastWalkEnd: 60,
  sinceLastPlayEnd: 60,
  sinceLastTrainingEnd: 60,
  waterSinceLastPee: 100,
  activeMinutesSinceLastPee: 30,
  mealsSinceLastPoop: 1,
  foodSinceLastPoop: 200,
  awakeMinutes: 60,
  playMinutesSinceWake: 60,
  energyNow: 5,
  energyTrend: 5,
  minutesSinceEnergyHigh: 60,
  minutesSinceEnergyLow: 60,
  minuteOfDay: 1440,
};

// Relative importance of each feature in the similarity metric.
export const FEATURE_WEIGHTS: Record<FeatureKey, number> = {
  sinceLastPee: 1.0,
  sinceLastPoop: 1.0,
  sinceLastMeal: 0.6,
  sinceLastWater: 0.6,
  sinceLastNapEnd: 0.8,
  sinceLastWalkEnd: 0.5,
  sinceLastPlayEnd: 0.6,
  sinceLastTrainingEnd: 0.4,
  waterSinceLastPee: 1.0,
  activeMinutesSinceLastPee: 0.6,
  mealsSinceLastPoop: 1.0,
  foodSinceLastPoop: 0.8,
  awakeMinutes: 1.0,
  playMinutesSinceWake: 0.6,
  energyNow: 0.8,
  energyTrend: 0.6,
  minutesSinceEnergyHigh: 0.4,
  minutesSinceEnergyLow: 0.4,
  minuteOfDay: 0.2,
};

export interface Context {
  features: Record<FeatureKey, number>;
  suffix: string[];
  napping: boolean;
}

const SPAN_END: Record<string, FeatureKey> = {
  nap: "sinceLastNapEnd",
  walk: "sinceLastWalkEnd",
  playtime: "sinceLastPlayEnd",
  training: "sinceLastTrainingEnd",
};

function endTime(e: EventRow): number {
  return e.endedAt ?? e.occurredAt;
}

function minuteOfDay(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

// Energy level in effect at time `t`: the amount of the most recent energy
// event at or before `t`, defaulting to the resting level.
function energyAt(events: EventRow[], t: number): number {
  let level = DEFAULT_ENERGY;
  for (const e of events) {
    if (e.type !== "energy") continue;
    if (e.occurredAt > t) break;
    level = e.amount ?? DEFAULT_ENERGY;
  }
  return level;
}

// Build the feature context describing the puppy's state at time `now`, using
// only events at or before `now` within the rolling window.
export function buildContext(all: EventRow[], now: number): Context {
  const windowMs = config.analyzer.contextWindowHours * HOUR;
  const windowMin = windowMs / MIN;
  const events = all.filter((e) => e.occurredAt <= now && e.occurredAt >= now - windowMs);

  const since = (pred: (e: EventRow) => number | null): number => {
    let last = -Infinity;
    for (const e of events) {
      const t = pred(e);
      if (t == null) continue;
      if (t <= now && t > last) last = t;
    }
    if (last === -Infinity) return windowMin;
    return clamp((now - last) / MIN, 0, windowMin);
  };

  const lastOccurred = (type: string) => since((e) => (e.type === type ? e.occurredAt : null));
  const lastEnded = (type: string) =>
    since((e) => (e.type === type && e.endedAt != null && e.endedAt <= now ? e.endedAt : null));

  // Most recent pee time (absolute) to scope "since last pee" accumulators.
  let lastPee = -Infinity;
  for (const e of events) if (e.type === "pee" && e.occurredAt <= now && e.occurredAt > lastPee) lastPee = e.occurredAt;
  const peeFloor = lastPee === -Infinity ? now - windowMs : lastPee;

  let waterSinceLastPee = 0;
  let activeMsSinceLastPee = 0;
  for (const e of events) {
    if (e.occurredAt <= peeFloor) continue;
    if (e.type === "water") waterSinceLastPee += e.amount ?? 60;
    if ((e.type === "walk" || e.type === "playtime") && e.occurredAt > peeFloor) {
      const end = Math.min(now, endTime(e));
      activeMsSinceLastPee += Math.max(0, end - Math.max(e.occurredAt, peeFloor));
    }
  }

  let lastPoop = -Infinity;
  for (const e of events) if (e.type === "poop" && e.occurredAt <= now && e.occurredAt > lastPoop) lastPoop = e.occurredAt;
  const poopFloor = lastPoop === -Infinity ? now - windowMs : lastPoop;
  let mealsSinceLastPoop = 0;
  let foodSinceLastPoop = 0;
  for (const e of events) {
    if (e.type === "meal" && e.occurredAt > poopFloor && e.occurredAt <= now) {
      mealsSinceLastPoop += 1;
      foodSinceLastPoop += e.amount ?? 60;
    }
  }

  // Awake time: minutes since the last nap ended. If a nap is currently open
  // (no end at/below now), the puppy is asleep -> 0 awake minutes.
  const ongoingNap = events.some(
    (e) => e.type === "nap" && e.occurredAt <= now && (e.endedAt == null || e.endedAt > now),
  );
  const awakeMinutes = ongoingNap ? 0 : lastEnded("nap");

  // Play minutes accumulated since the last wake.
  let wakeTime = -Infinity;
  for (const e of events) {
    if (e.type === "nap" && e.endedAt != null && e.endedAt <= now && e.endedAt > wakeTime) wakeTime = e.endedAt;
  }
  const wakeFloor = wakeTime === -Infinity ? now - windowMs : wakeTime;
  let playMsSinceWake = 0;
  for (const e of events) {
    if (e.type !== "playtime") continue;
    const end = Math.min(now, endTime(e));
    if (end > wakeFloor) playMsSinceWake += Math.max(0, end - Math.max(e.occurredAt, wakeFloor));
  }

  const energyNow = ongoingNap ? 0 : energyAt(events, now);
  const energyPrev = energyAt(events, now - 60 * MIN);
  const energyTrend = energyNow - energyPrev;

  const sinceEnergyLevel = (pred: (lvl: number) => boolean): number => {
    let last = -Infinity;
    for (const e of events) {
      if (e.type !== "energy" || e.occurredAt > now) continue;
      if (pred(e.amount ?? DEFAULT_ENERGY) && e.occurredAt > last) last = e.occurredAt;
    }
    return last === -Infinity ? windowMin : clamp((now - last) / MIN, 0, windowMin);
  };

  const features: Record<FeatureKey, number> = {
    sinceLastPee: lastOccurred("pee"),
    sinceLastPoop: lastOccurred("poop"),
    sinceLastMeal: lastOccurred("meal"),
    sinceLastWater: lastOccurred("water"),
    sinceLastNapEnd: lastEnded("nap"),
    sinceLastWalkEnd: lastEnded("walk"),
    sinceLastPlayEnd: lastEnded("playtime"),
    sinceLastTrainingEnd: lastEnded("training"),
    waterSinceLastPee,
    activeMinutesSinceLastPee: activeMsSinceLastPee / MIN,
    mealsSinceLastPoop,
    foodSinceLastPoop,
    awakeMinutes,
    playMinutesSinceWake: playMsSinceWake / MIN,
    energyNow,
    energyTrend,
    minutesSinceEnergyHigh: sinceEnergyLevel((l) => l >= 4),
    minutesSinceEnergyLow: sinceEnergyLevel((l) => l <= 1),
    minuteOfDay: minuteOfDay(now),
  };

  // Last four event tokens, span ends tagged (e.g. napEnd) when already ended.
  const tokens = [...events]
    .sort((a, b) => endTime(a) - endTime(b))
    .map((e) => (SPAN_END[e.type] && e.endedAt != null && e.endedAt <= now ? `${e.type}End` : e.type));
  const suffix = tokens.slice(-4);

  return { features, suffix, napping: ongoingNap };
}

// Squared, weighted, scaled distance between two feature contexts.
export function featureDistance(a: Record<FeatureKey, number>, b: Record<FeatureKey, number>): number {
  let d2 = 0;
  for (const k of FEATURE_KEYS) {
    const diff = (a[k] - b[k]) / FEATURE_SCALE[k];
    d2 += FEATURE_WEIGHTS[k] * diff * diff;
  }
  return d2;
}

export function suffixMatchLen(a: string[], b: string[]): number {
  let n = 0;
  let i = a.length - 1;
  let j = b.length - 1;
  while (i >= 0 && j >= 0 && a[i] === b[j]) {
    n += 1;
    i -= 1;
    j -= 1;
  }
  return n;
}
