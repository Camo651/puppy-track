import type { EventType } from "@puppy-track/common";
import type { SeedEvent } from "./db";

export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

// Deterministic PRNG (mulberry32) so every generated dataset is reproducible
// from its seed; tests must never depend on Math.random.
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard-normal sample via Box-Muller, used to jitter anchor times and
// trigger delays so generated intervals have realistic (non-zero) variance.
function gauss(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function jitter(rng: () => number, sigmaMs: number): number {
  return gauss(rng) * sigmaMs;
}

function chance(rng: () => number, p: number): boolean {
  return rng() < p;
}

/**
 * A single anchored activity in the daily template. Minutes are measured from
 * local midnight. Spans (naps/walks/playtime) carry a duration.
 */
interface Anchor {
  type: EventType;
  minute: number;
  anchorSigmaMin: number;
  durationMin?: number;
  durationSigmaMin?: number;
  amount?: [min: number, max: number];
}

/**
 * Daily routine for a ~12-week-old puppy. Grounded in common puppy care
 * guidance:
 *  - Young puppies sleep ~18-20h/day in frequent naps plus a long night sleep.
 *  - Three scheduled meals; water clusters around meals and activity.
 *  - The gastrocolic reflex means a poop usually follows a meal within ~30 min.
 *  - Bladders are small: pees cluster right after waking, eating, drinking,
 *    and play, on top of a background "every ~70 min while awake" cadence.
 */
const ROUTINE: Anchor[] = [
  // Meals (three a day).
  { type: "meal", minute: 7 * 60, anchorSigmaMin: 10, amount: [60, 80] },
  { type: "meal", minute: 12 * 60 + 30, anchorSigmaMin: 12, amount: [60, 80] },
  { type: "meal", minute: 17 * 60 + 30, anchorSigmaMin: 12, amount: [60, 80] },
  // Standalone water (meal-adjacent water is derived below).
  { type: "water", minute: 10 * 60, anchorSigmaMin: 20, amount: [50, 120] },
  { type: "water", minute: 15 * 60, anchorSigmaMin: 20, amount: [50, 120] },
  // Walks.
  { type: "walk", minute: 7 * 60 + 40, anchorSigmaMin: 12, durationMin: 25, durationSigmaMin: 6 },
  { type: "walk", minute: 18 * 60, anchorSigmaMin: 15, durationMin: 30, durationSigmaMin: 8 },
  // Playtime bursts.
  { type: "playtime", minute: 9 * 60 + 15, anchorSigmaMin: 15, durationMin: 30, durationSigmaMin: 8 },
  { type: "playtime", minute: 14 * 60 + 40, anchorSigmaMin: 18, durationMin: 30, durationSigmaMin: 8 },
  { type: "playtime", minute: 20 * 60, anchorSigmaMin: 15, durationMin: 25, durationSigmaMin: 6 },
  // Daytime naps.
  { type: "nap", minute: 8 * 60 + 20, anchorSigmaMin: 12, durationMin: 60, durationSigmaMin: 12 },
  { type: "nap", minute: 10 * 60 + 40, anchorSigmaMin: 15, durationMin: 55, durationSigmaMin: 12 },
  { type: "nap", minute: 13 * 60 + 10, anchorSigmaMin: 18, durationMin: 80, durationSigmaMin: 15 },
  { type: "nap", minute: 15 * 60 + 40, anchorSigmaMin: 18, durationMin: 60, durationSigmaMin: 12 },
  // Long overnight sleep (spills into the next morning ~06:30).
  { type: "nap", minute: 21 * 60 + 30, anchorSigmaMin: 20, durationMin: 540, durationSigmaMin: 20 },
];

export interface GenerateOptions {
  days: number;
  seed?: number;
  // Scales all jitter. 1 = realistic; <1 = very routine puppy; >1 = chaotic.
  noise?: number;
  // Local-midnight (UTC) timestamp of day 0.
  startMidnight?: number;
}

export interface GeneratedHistory {
  events: SeedEvent[];
  startMidnight: number;
  endTime: number;
}

const DEFAULT_START = Date.UTC(2026, 0, 5, 0, 0, 0); // Mon Jan 5 2026, 00:00 UTC

/**
 * Generate a realistic multi-day event history for one puppy. Returns events
 * sorted by occurrence. Pees/poops are emitted both from physiological triggers
 * (waking, meals, water, play, walks) and a light background bladder cadence.
 */
export function generatePuppyHistory(opts: GenerateOptions): GeneratedHistory {
  const { days } = opts;
  const noise = opts.noise ?? 1;
  const start = opts.startMidnight ?? DEFAULT_START;
  const rng = makeRng(opts.seed ?? 1);

  const events: SeedEvent[] = [];
  const pees: number[] = []; // track pee times to space out background pees

  const addPee = (t: number, minGapMin = 25): void => {
    if (pees.some((p) => Math.abs(p - t) < minGapMin * MIN)) return;
    pees.push(t);
    events.push({ type: "pee", occurredAt: t });
  };
  const addPoop = (t: number): void => events.push({ type: "poop", occurredAt: t });

  for (let d = 0; d < days; d++) {
    const dayStart = start + d * DAY;

    for (const a of ROUTINE) {
      const at = dayStart + a.minute * MIN + jitter(rng, a.anchorSigmaMin * MIN * noise);

      if (a.durationMin != null) {
        const dur = Math.max(
          8 * MIN,
          a.durationMin * MIN + jitter(rng, (a.durationSigmaMin ?? 6) * MIN * noise),
        );
        const endedAt = at + dur;
        events.push({ type: a.type, occurredAt: at, endedAt });

        // Energy drops to asleep at nap start and rebounds on waking.
        if (a.type === "nap") {
          events.push({ type: "energy", occurredAt: at + MIN, amount: 0 });
          events.push({
            type: "energy",
            occurredAt: endedAt + 4 * MIN + jitter(rng, 3 * MIN * noise),
            amount: 3 + Math.round(rng() * 2),
          });
        }
        // Playtime spikes energy into the zoomies.
        if (a.type === "playtime") {
          events.push({ type: "energy", occurredAt: at + MIN, amount: 4 + Math.round(rng()) });
        }

        // Waking from any sleep almost always means an immediate pee.
        if (a.type === "nap" && chance(rng, 0.95)) {
          addPee(endedAt + 8 * MIN + jitter(rng, 4 * MIN * noise), 10);
        }
        // Play winds up the bladder too.
        if (a.type === "playtime" && chance(rng, 0.8)) {
          addPee(endedAt + 10 * MIN + jitter(rng, 5 * MIN * noise));
        }
        // Walks are prime potty opportunities; morning walk often a poop too.
        if (a.type === "walk") {
          if (chance(rng, 0.9)) addPee(endedAt + 3 * MIN + jitter(rng, 3 * MIN * noise), 10);
          const morning = a.minute < 12 * 60;
          if (morning && chance(rng, 0.85)) addPoop(endedAt + 5 * MIN + jitter(rng, 4 * MIN * noise));
        }
        continue;
      }

      // Instant / amount anchors.
      const amount = a.amount
        ? Math.round(a.amount[0] + rng() * (a.amount[1] - a.amount[0]))
        : null;
      events.push({ type: a.type, occurredAt: at, amount });

      if (a.type === "meal") {
        // Meal-adjacent water.
        events.push({
          type: "water",
          occurredAt: at + 8 * MIN + jitter(rng, 4 * MIN * noise),
          amount: Math.round(40 + rng() * 60),
        });
        // Gastrocolic reflex: poop ~22 min later, stronger earlier in the day.
        const morning = a.minute < 10 * 60;
        const midday = a.minute >= 10 * 60 && a.minute < 15 * 60;
        const poopP = morning ? 0.9 : midday ? 0.8 : 0.4;
        if (chance(rng, poopP)) addPoop(at + 22 * MIN + jitter(rng, 8 * MIN * noise));
        // Often a pee after eating as well.
        if (chance(rng, 0.6)) addPee(at + 28 * MIN + jitter(rng, 8 * MIN * noise));
        // A full belly brings energy down toward a post-meal lull.
        if (chance(rng, 0.6)) {
          events.push({
            type: "energy",
            occurredAt: at + 50 * MIN + jitter(rng, 10 * MIN * noise),
            amount: 1 + Math.round(rng()),
          });
        }
      }

      if (a.type === "water" && chance(rng, 0.5)) {
        addPee(at + 40 * MIN + jitter(rng, 10 * MIN * noise));
      }
    }

    // Background bladder cadence: a pee roughly every ~70 min during the
    // awake daytime window (07:00-21:00), skipped when one already lands near.
    for (let m = 7 * 60; m <= 21 * 60; m += 70) {
      const t = dayStart + m * MIN + jitter(rng, 18 * MIN * noise);
      if (chance(rng, 0.7)) addPee(t);
    }
  }

  events.sort((a, b) => a.occurredAt - b.occurredAt);
  return { events, startMidnight: start, endTime: start + days * DAY };
}

/** Evenly spaced events of one type with Gaussian jitter on the interval. */
export function regularSeries(
  type: EventType,
  opts: {
    start: number;
    count: number;
    periodMs: number;
    jitterMs?: number;
    seed?: number;
    amount?: number;
  },
): SeedEvent[] {
  const rng = makeRng(opts.seed ?? 7);
  const out: SeedEvent[] = [];
  let t = opts.start;
  for (let i = 0; i < opts.count; i++) {
    out.push({ type, occurredAt: Math.round(t), amount: opts.amount ?? null });
    t += opts.periodMs + (opts.jitterMs ? jitter(rng, opts.jitterMs) : 0);
  }
  return out;
}

export interface ScenarioStep {
  type: EventType;
  atMin: number;
  amount?: number | null;
  durationMin?: number;
}

/**
 * Script an exact daily chain of events and (optionally) repeat it across days
 * with light jitter. Useful for controlled context tests where the ordering of
 * events (e.g. water -> nap -> pee vs water -> pee -> nap) is the variable under
 * test. `atMin` is minutes from each day's local midnight.
 */
export function buildScenario(
  steps: ScenarioStep[],
  opts?: { days?: number; startMidnight?: number; jitterMin?: number; seed?: number },
): SeedEvent[] {
  const days = opts?.days ?? 1;
  const start = opts?.startMidnight ?? DEFAULT_START;
  const jitterMin = opts?.jitterMin ?? 0;
  const rng = makeRng(opts?.seed ?? 3);
  const out: SeedEvent[] = [];
  for (let d = 0; d < days; d++) {
    const dayStart = start + d * DAY;
    for (const s of steps) {
      const at = dayStart + s.atMin * MIN + (jitterMin ? jitter(rng, jitterMin * MIN) : 0);
      const ev: SeedEvent = { type: s.type, occurredAt: Math.round(at), amount: s.amount ?? null };
      if (s.durationMin != null) ev.endedAt = Math.round(at + s.durationMin * MIN);
      out.push(ev);
    }
  }
  out.sort((a, b) => a.occurredAt - b.occurredAt);
  return out;
}

/**
 * Trigger/target pairs: each trigger is followed by a target after `delayMs`
 * (with jitter). Triggers repeat every `periodMs`. Spans get an `endedAt`.
 */
export function triggerSeries(
  triggerType: EventType,
  targetType: EventType,
  opts: {
    start: number;
    count: number;
    periodMs: number;
    delayMs: number;
    delayJitterMs?: number;
    triggerDurationMs?: number;
    seed?: number;
    targetChance?: number;
  },
): SeedEvent[] {
  const rng = makeRng(opts.seed ?? 11);
  const out: SeedEvent[] = [];
  let t = opts.start;
  for (let i = 0; i < opts.count; i++) {
    const endedAt = opts.triggerDurationMs != null ? t + opts.triggerDurationMs : undefined;
    out.push({ type: triggerType, occurredAt: Math.round(t), endedAt });
    const triggerMoment = endedAt ?? t;
    if (rng() < (opts.targetChance ?? 1)) {
      const delay = opts.delayMs + (opts.delayJitterMs ? jitter(rng, opts.delayJitterMs) : 0);
      out.push({ type: targetType, occurredAt: Math.round(triggerMoment + Math.max(MIN, delay)) });
    }
    t += opts.periodMs;
  }
  out.sort((a, b) => a.occurredAt - b.occurredAt);
  return out;
}
