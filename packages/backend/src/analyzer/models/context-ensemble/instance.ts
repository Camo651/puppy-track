import type { EventRow } from "../types";
import {
  buildContext,
  featureDistance,
  recencyWeight,
  suffixMatchLen,
  weightedMedian,
  type Context,
} from "./context";

const BW = 1.0;

export interface DecisionPoint {
  t: number;
  ctx: Context;
}

// Every moment worth matching against: each event's occurrence, plus span ends
// (waking, finishing a walk) which are strong predictors. Context is built once
// per point and reused across all targets.
export function decisionPoints(all: EventRow[], now: number): DecisionPoint[] {
  const times = new Set<number>();
  for (const e of all) {
    if (e.occurredAt <= now) times.add(e.occurredAt);
    if (e.endedAt != null && e.endedAt <= now) times.add(e.endedAt);
  }
  const out: DecisionPoint[] = [];
  for (const t of times) out.push({ t, ctx: buildContext(all, t) });
  out.sort((a, b) => a.t - b.t);
  return out;
}

// First target time strictly after `t`, via binary search on the sorted array.
function firstAfter(sorted: number[], t: number): number | null {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] > t) hi = mid;
    else lo = mid + 1;
  }
  return lo < sorted.length ? sorted[lo] : null;
}

export interface InstanceResult {
  p1: number;
  delayP1Ms: number;
  effSupport: number;
  posSupport: number;
  posCount: number;
  matchedPoints: number;
}

// Kernel-weighted instance (kNN-style) estimate: how often target T followed
// moments that looked like `now`, and how soon.
export function instancePredict(
  nowCtx: Context,
  dps: DecisionPoint[],
  targetTimesSorted: number[],
  horizonMs: number,
  now: number,
): InstanceResult {
  let S = 0;
  let Spos = 0;
  let posCount = 0;
  let matchedPoints = 0;
  const delays: number[] = [];
  const dw: number[] = [];

  for (const dp of dps) {
    const d2 = featureDistance(nowCtx.features, dp.ctx.features);
    const sm = suffixMatchLen(nowCtx.suffix, dp.ctx.suffix);
    const s = Math.exp(-Math.max(0, d2 - 0.5 * sm) / (2 * BW * BW)) * recencyWeight(now - dp.t);
    if (s <= 1e-6) continue;
    matchedPoints += 1;
    S += s;

    const next = firstAfter(targetTimesSorted, dp.t);
    const hit = next != null && next - dp.t <= horizonMs;
    if (hit) {
      Spos += s;
      posCount += 1;
      delays.push(next! - dp.t);
      dw.push(s);
    }
  }

  return {
    p1: S > 0 ? Spos / S : 0,
    delayP1Ms: delays.length ? weightedMedian(delays, dw) : 0,
    effSupport: S,
    posSupport: Spos,
    posCount,
    matchedPoints,
  };
}
