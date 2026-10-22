import type { PredictionTarget } from "@puppy-track/common";
import type { EventRow } from "../types";
import { clamp, MIN, recencyWeight, weightedMean, type Context } from "./context";

export interface Typicals {
  peeMs: number;
  waterPerPee: number;
  poopMs: number;
  mealsPerPoop: number;
  awakeMs: number;
}

const DEFAULTS: Typicals = {
  peeMs: 70 * MIN,
  waterPerPee: 150,
  poopMs: 300 * MIN,
  mealsPerPoop: 1.5,
  awakeMs: 90 * MIN,
};

function gaps(times: number[]): { gap: number; at: number }[] {
  const out: { gap: number; at: number }[] = [];
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g > 0 && g <= 12 * 60 * MIN) out.push({ gap: g, at: times[i] });
  }
  return out;
}

// Recency-weighted "typical" physiological scales learned from history, with
// sane fallbacks when data is sparse (cold start).
export function learnTypicals(all: EventRow[], now: number): Typicals {
  const peeTimes = all.filter((e) => e.type === "pee").map((e) => e.occurredAt);
  const poopTimes = all.filter((e) => e.type === "poop").map((e) => e.occurredAt);

  const peeGaps = gaps(peeTimes);
  const peeMs = peeGaps.length >= 3
    ? weightedMean(peeGaps.map((g) => g.gap), peeGaps.map((g) => recencyWeight(now - g.at)))
    : DEFAULTS.peeMs;

  // Water consumed between consecutive pees.
  const waterPerPeeVals: number[] = [];
  const waterPerPeeW: number[] = [];
  for (let i = 1; i < peeTimes.length; i++) {
    let sum = 0;
    for (const e of all) {
      if (e.type === "water" && e.occurredAt > peeTimes[i - 1] && e.occurredAt <= peeTimes[i]) {
        sum += e.amount ?? 60;
      }
    }
    waterPerPeeVals.push(sum);
    waterPerPeeW.push(recencyWeight(now - peeTimes[i]));
  }
  const waterPerPee = waterPerPeeVals.length >= 3 ? Math.max(30, weightedMean(waterPerPeeVals, waterPerPeeW)) : DEFAULTS.waterPerPee;

  const poopGaps = gaps(poopTimes);
  const poopMs = poopGaps.length >= 3
    ? weightedMean(poopGaps.map((g) => g.gap), poopGaps.map((g) => recencyWeight(now - g.at)))
    : DEFAULTS.poopMs;

  const mealsPerPoopVals: number[] = [];
  const mealsPerPoopW: number[] = [];
  for (let i = 1; i < poopTimes.length; i++) {
    let count = 0;
    for (const e of all) {
      if (e.type === "meal" && e.occurredAt > poopTimes[i - 1] && e.occurredAt <= poopTimes[i]) count += 1;
    }
    mealsPerPoopVals.push(count);
    mealsPerPoopW.push(recencyWeight(now - poopTimes[i]));
  }
  const mealsPerPoop = mealsPerPoopVals.length >= 3 ? Math.max(1, weightedMean(mealsPerPoopVals, mealsPerPoopW)) : DEFAULTS.mealsPerPoop;

  // Awake durations: nap end -> next nap start.
  const naps = all
    .filter((e) => e.type === "nap")
    .sort((a, b) => a.occurredAt - b.occurredAt);
  const awakeVals: number[] = [];
  const awakeW: number[] = [];
  for (let i = 1; i < naps.length; i++) {
    const prevEnd = naps[i - 1].endedAt ?? naps[i - 1].occurredAt;
    const dur = naps[i].occurredAt - prevEnd;
    if (dur > 5 * MIN && dur <= 10 * 60 * MIN) {
      awakeVals.push(dur);
      awakeW.push(recencyWeight(now - naps[i].occurredAt));
    }
  }
  const awakeMs = awakeVals.length >= 3 ? weightedMean(awakeVals, awakeW) : DEFAULTS.awakeMs;

  return { peeMs, waterPerPee, poopMs, mealsPerPoop, awakeMs };
}

export interface HazardResult {
  p2: number;
  predictedDelayMs: number;
  terms: { key: string; label: string; weight: number }[];
}

// Physiological hazard for one target from the current context and learned
// typicals. `terms` carry the pressure decomposition for attribution.
export function hazard(target: PredictionTarget, ctx: Context, typ: Typicals): HazardResult {
  const f = ctx.features;
  if (target === "pee") {
    const t1 = 0.6 * (f.sinceLastPee / (typ.peeMs / MIN));
    const t2 = 0.3 * (f.waterSinceLastPee / typ.waterPerPee);
    const t3 = 0.1 * (f.activeMinutesSinceLastPee / 30);
    const pressure = t1 + t2 + t3;
    return {
      p2: clamp(1 - Math.exp(-pressure), 0, 1),
      predictedDelayMs: Math.max(0, typ.peeMs - f.sinceLastPee * MIN),
      terms: [
        { key: "pee|sinceLastPee", label: "a while since last pee", weight: t1 },
        { key: "pee|waterSincePee", label: "drank water", weight: t2 },
        { key: "pee|active", label: "active recently", weight: t3 },
      ],
    };
  }
  if (target === "poop") {
    const t1 = 0.6 * (f.sinceLastPoop / (typ.poopMs / MIN));
    const t2 = 0.4 * (f.mealsSinceLastPoop / Math.max(1, typ.mealsPerPoop));
    const pressure = t1 + t2;
    return {
      p2: clamp(1 - Math.exp(-pressure), 0, 1),
      predictedDelayMs: Math.max(0, typ.poopMs - f.sinceLastPoop * MIN),
      terms: [
        { key: "poop|sinceLastPoop", label: "a while since last poop", weight: t1 },
        { key: "poop|mealsSincePoop", label: "ate since last poop", weight: t2 },
      ],
    };
  }
  if (target === "nap") {
    const t1 = 0.5 * (f.awakeMinutes / (typ.awakeMs / MIN));
    const t2 = 0.3 * Math.max(0, (3 - f.energyNow) / 3);
    const t3 = 0.2 * Math.max(0, -f.energyTrend);
    const pressure = t1 + t2 + t3;
    return {
      p2: clamp(1 - Math.exp(-pressure), 0, 1),
      predictedDelayMs: Math.max(0, typ.awakeMs - f.awakeMinutes * MIN),
      terms: [
        { key: "nap|awake", label: "awake a while", weight: t1 },
        { key: "nap|energyLow", label: "low energy", weight: t2 },
        { key: "nap|energyFalling", label: "energy falling", weight: t3 },
      ],
    };
  }
  if (target === "energy_high") {
    const justWoke = f.awakeMinutes < 45 && !ctx.napping ? 1 : 0;
    const justPlayed = f.sinceLastPlayEnd < 20 ? 1 : 0;
    const t1 = 0.5 * clamp(Math.max(0, f.energyTrend) / 2, 0, 1);
    const t2 = 0.3 * justWoke;
    const t3 = 0.2 * justPlayed;
    const pressure = t1 + t2 + t3;
    return {
      p2: clamp(1 - Math.exp(-pressure), 0, 1),
      predictedDelayMs: 20 * MIN,
      terms: [
        { key: "energy_high|rising", label: "energy rising", weight: t1 },
        { key: "energy_high|recentWake", label: "just woke up", weight: t2 },
        { key: "energy_high|recentPlay", label: "just played", weight: t3 },
      ],
    };
  }
  // energy_low
  const recentMeal = f.sinceLastMeal < 60 ? 1 : 0;
  const longAwake = clamp(f.awakeMinutes / (typ.awakeMs / MIN), 0, 1);
  const t1 = 0.4 * Math.max(0, (3 - f.energyNow) / 3);
  const t2 = 0.3 * recentMeal;
  const t3 = 0.3 * longAwake;
  const pressure = t1 + t2 + t3;
  return {
    p2: clamp(1 - Math.exp(-pressure), 0, 1),
    predictedDelayMs: 30 * MIN,
    terms: [
      { key: "energy_low|lowEnergy", label: "energy low", weight: t1 },
      { key: "energy_low|recentMeal", label: "ate recently", weight: t2 },
      { key: "energy_low|longAwake", label: "awake a while", weight: t3 },
    ],
  };
}
