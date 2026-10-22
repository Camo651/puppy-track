import { PREDICTION_TARGETS, TARGET_META, type PredictionFactor, type PredictionTarget } from "@puppy-track/common";
import { realTargetTimes } from "../../targets";
import type { EventRow, EventSnapshot, ModelPrediction, PredictionModel } from "../types";
import { buildContext, clamp, MIN, recencyWeight } from "../context-ensemble/context";
import { hazard, learnTypicals, type Typicals } from "../context-ensemble/hazard";

const DIMS = ["bladder", "bowel", "sleep", "energy"] as const;
type Dim = (typeof DIMS)[number];
const DIM_LABEL: Record<Dim, string> = {
  bladder: "bladder fill",
  bowel: "bowel fill",
  sleep: "sleep pressure",
  energy: "energy level",
};

const SHORT = 10 * MIN; // local window used to estimate event intensity
const STEP = 5 * MIN; // rollout integration step
const HORIZON_MS: Record<PredictionTarget, number> = {
  pee: 45 * MIN,
  poop: 45 * MIN,
  nap: 60 * MIN,
  energy_high: 60 * MIN,
  energy_low: 60 * MIN,
};
const BW = 0.5; // state-space kernel bandwidth
const MIN_SUPPORT = 1.0;
const FLOOR = 0.12;

type State = Record<Dim, number>;

function stateFrom(features: Record<string, number>, typ: Typicals): State {
  const f = features;
  return {
    bladder:
      0.6 * (f.sinceLastPee / (typ.peeMs / MIN)) +
      0.3 * (f.waterSinceLastPee / typ.waterPerPee) +
      0.1 * (f.activeMinutesSinceLastPee / 30),
    bowel:
      0.6 * (f.sinceLastPoop / (typ.poopMs / MIN)) +
      0.4 * (f.mealsSinceLastPoop / Math.max(1, typ.mealsPerPoop)),
    sleep:
      0.5 * (f.awakeMinutes / (typ.awakeMs / MIN)) +
      0.3 * Math.max(0, (3 - f.energyNow) / 3) +
      0.2 * Math.max(0, -f.energyTrend),
    energy: f.energyNow / 5,
  };
}

function dist2(a: State, b: State): number {
  let d = 0;
  for (const k of DIMS) {
    const diff = a[k] - b[k];
    d += diff * diff;
  }
  return d;
}

interface Sample {
  t: number;
  x: State;
  dxdt: State | null; // per-ms drift to the next sample
  hitShort: Record<PredictionTarget, number>; // target within SHORT after t
}

function buildSamples(events: EventRow[], now: number, typ: Typicals): Sample[] {
  const times = new Set<number>();
  for (const e of events) {
    if (e.occurredAt <= now) times.add(e.occurredAt);
    if (e.endedAt != null && e.endedAt <= now) times.add(e.endedAt);
  }
  const sorted = [...times].sort((a, b) => a - b);
  const targetTimes: Record<PredictionTarget, number[]> = {
    pee: realTargetTimes(events, "pee"),
    poop: realTargetTimes(events, "poop"),
    nap: realTargetTimes(events, "nap"),
    energy_high: realTargetTimes(events, "energy_high"),
    energy_low: realTargetTimes(events, "energy_low"),
  };
  const hitWithin = (arr: number[], t: number, win: number): number =>
    arr.some((x) => x > t && x - t <= win) ? 1 : 0;

  const samples: Sample[] = sorted.map((t) => ({
    t,
    x: stateFrom(buildContext(events, t).features, typ),
    dxdt: null,
    hitShort: {
      pee: hitWithin(targetTimes.pee, t, SHORT),
      poop: hitWithin(targetTimes.poop, t, SHORT),
      nap: hitWithin(targetTimes.nap, t, SHORT),
      energy_high: hitWithin(targetTimes.energy_high, t, SHORT),
      energy_low: hitWithin(targetTimes.energy_low, t, SHORT),
    },
  }));
  for (let i = 0; i < samples.length - 1; i++) {
    const dt = samples[i + 1].t - samples[i].t;
    if (dt <= 0 || dt > 3 * 60 * MIN) continue;
    const a = samples[i].x;
    const b = samples[i + 1].x;
    const d: State = { bladder: 0, bowel: 0, sleep: 0, energy: 0 };
    for (const k of DIMS) d[k] = (b[k] - a[k]) / dt;
    samples[i].dxdt = d;
  }
  return samples;
}

// Kernel weights of all samples relative to state x (plus recency).
function weightsAt(samples: Sample[], x: State, now: number): number[] {
  return samples.map((s) => Math.exp(-dist2(x, s.x) / (2 * BW * BW)) * recencyWeight(now - s.t));
}

function driftAt(samples: Sample[], w: number[]): State {
  const d: State = { bladder: 0, bowel: 0, sleep: 0, energy: 0 };
  let sw = 0;
  for (let i = 0; i < samples.length; i++) {
    if (!samples[i].dxdt) continue;
    sw += w[i];
    for (const k of DIMS) d[k] += w[i] * samples[i].dxdt![k];
  }
  if (sw > 0) for (const k of DIMS) d[k] /= sw;
  return d;
}

// Per-STEP firing probability for target T at state x (local hazard).
function stepProb(samples: Sample[], w: number[], target: PredictionTarget): { p: number; support: number } {
  let num = 0;
  let den = 0;
  for (let i = 0; i < samples.length; i++) {
    num += w[i] * samples[i].hitShort[target];
    den += w[i];
  }
  const support = den;
  const rate = den > 0 ? num / den : 0;
  return { p: clamp(rate * (STEP / SHORT), 0, 0.99), support };
}

// Dynamical-systems model (shadow): treat the puppy's state as a point drifting
// through a learned field, with state-dependent event intensities. Rolls the
// state forward and accumulates firing probability; attributes via sensitivity
// of the local intensity to each state dimension. Falls back to the hazard
// model when the local neighborhood is too sparse.
export const flow: PredictionModel = {
  id: "flow",
  label: "Flow (vector field)",
  version: 1,
  predict(snap: EventSnapshot): ModelPrediction[] {
    const { events, now } = snap;
    if (events.length < 4) return [];
    const typ = learnTypicals(events, now);
    const ctx = buildContext(events, now);
    const samples = buildSamples(events, now, typ);
    if (samples.length < 4) return [];

    const x0 = stateFrom(ctx.features, typ);
    const w0 = weightsAt(samples, x0, now);
    const support0 = w0.reduce((a, b) => a + b, 0);
    const out: ModelPrediction[] = [];

    for (const target of PREDICTION_TARGETS) {
      // Cold start / sparse neighborhood: defer to the physiological hazard.
      if (support0 < MIN_SUPPORT) {
        const hz = hazard(target, ctx, typ);
        if (hz.p2 < FLOOR) continue;
        const predictedAt = now + hz.predictedDelayMs;
        const spread = clamp(hz.predictedDelayMs * 0.4, 15 * MIN, 60 * MIN);
        if (predictedAt + spread < now) continue;
        const terms = hz.terms.filter((t) => t.weight > 0.01).sort((a, b) => b.weight - a.weight).slice(0, 3);
        out.push({
          target,
          predictedAt,
          windowStart: predictedAt - spread,
          windowEnd: predictedAt + spread,
          probability: hz.p2,
          summary: `${TARGET_META[target].label}: ${terms[0]?.label ?? "estimate"}.`,
          factors: terms.map((t) => ({ key: `flow|${t.key}`, label: t.label, weight: t.weight })),
          evidence: "flow cold start (hazard fallback)",
          context: ctx.features,
        });
        continue;
      }

      // Roll the state forward, accumulating survival.
      let x = { ...x0 };
      let surv = 1;
      let predictedAt = now;
      let crossed = false;
      let bestStepP = 0;
      let bestStepAt = now;
      const H = HORIZON_MS[target];
      for (let elapsed = STEP; elapsed <= H; elapsed += STEP) {
        const w = weightsAt(samples, x, now);
        const { p } = stepProb(samples, w, target);
        surv *= 1 - p;
        if (p > bestStepP) {
          bestStepP = p;
          bestStepAt = now + elapsed;
        }
        if (!crossed && 1 - surv >= 0.5) {
          predictedAt = now + elapsed;
          crossed = true;
        }
        const drift = driftAt(samples, w);
        for (const k of DIMS) x[k] = Math.max(0, x[k] + drift[k] * STEP);
      }
      const probability = clamp(1 - surv, 0, 1);
      if (probability < FLOOR) continue;
      if (!crossed) predictedAt = bestStepAt;
      const spread = clamp((predictedAt - now) * 0.4, 15 * MIN, 60 * MIN);
      const windowEnd = predictedAt + spread;
      if (windowEnd < now) continue;

      // Attribution: sensitivity of the local step probability to each dim.
      const base = stepProb(samples, w0, target).p;
      const sens: PredictionFactor[] = [];
      for (const k of DIMS) {
        const xp = { ...x0, [k]: x0[k] + 0.3 };
        const wp = weightsAt(samples, xp, now);
        const dp = stepProb(samples, wp, target).p - base;
        if (dp > 0.001) sens.push({ key: `flow|${k}`, label: DIM_LABEL[k], weight: dp });
      }
      sens.sort((a, b) => b.weight - a.weight);
      const factors = sens.slice(0, 3);
      if (factors.length === 0) {
        factors.push({ key: `flow|${target}`, label: `${TARGET_META[target].label} intensity`, weight: probability });
      }

      out.push({
        target,
        predictedAt,
        windowStart: predictedAt - spread,
        windowEnd,
        probability,
        summary: `${TARGET_META[target].label}: ${factors[0].label} rising.`,
        factors,
        evidence: `flow field over ${samples.length} states`,
        context: ctx.features,
      });
    }

    return out;
  },
};
