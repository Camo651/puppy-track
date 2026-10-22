import { PREDICTION_TARGETS, TARGET_META, type PredictionFactor, type PredictionTarget } from "@puppy-track/common";
import { realTargetTimes } from "../../targets";
import type { EventSnapshot, ModelPrediction, PredictionModel } from "../types";
import { buildContext, clamp, MIN, type FeatureKey } from "./context";
import { hazard, learnTypicals } from "./hazard";
import { decisionPoints, instancePredict } from "./instance";
import { factorReliability, loadFactorStats } from "./reliability";

const HORIZON_MS: Record<PredictionTarget, number> = {
  pee: 45 * MIN,
  poop: 45 * MIN,
  nap: 60 * MIN,
  energy_high: 60 * MIN,
  energy_low: 60 * MIN,
};

const K0 = 2; // hazard pseudo-count in the blend
const FLOOR = 0.12; // minimum probability worth storing a prediction for
const MAX_AHEAD = 6 * 60 * MIN; // ignore forecasts further out than this

// Rolling-window context model. For each target it blends an instance-based
// estimate (how often target T followed moments that looked like now) with a
// physiological hazard, attributes the result to interpretable factors, and
// shrinks confidence for factors that have been unreliable in the past.
export const contextEnsemble: PredictionModel = {
  id: "context-ensemble",
  label: "Context ensemble",
  version: 1,
  predict(snap: EventSnapshot): ModelPrediction[] {
    const { events, now } = snap;
    if (events.length < 4) return [];

    const nowCtx = buildContext(events, now);
    const typ = learnTypicals(events, now);
    const dps = decisionPoints(events, now);
    const stats = loadFactorStats(this.id, now);
    const out: ModelPrediction[] = [];

    for (const target of PREDICTION_TARGETS) {
      const targetTimes = realTargetTimes(events, target);
      const inst = instancePredict(nowCtx, dps, targetTimes, HORIZON_MS[target], now);
      const hz = hazard(target, nowCtx, typ);

      const S = inst.effSupport;
      const p = (S * inst.p1 + K0 * hz.p2) / (S + K0);
      const usedInstance = S >= K0 && inst.posCount > 0;
      const delayMs = usedInstance ? inst.delayP1Ms : hz.predictedDelayMs;
      const predictedAt = now + delayMs;
      const spread = clamp(delayMs * 0.4, 15 * MIN, 60 * MIN);
      const windowStart = predictedAt - spread;
      const windowEnd = predictedAt + spread;

      // Base factors from the hazard decomposition, plus a "similar past" factor
      // when the instance model carried the estimate.
      const base: PredictionFactor[] = hz.terms
        .filter((t) => t.weight > 0.01)
        .map((t) => ({ key: t.key, label: t.label, weight: t.weight }));
      if (usedInstance && inst.p1 > 0.3) {
        base.push({ key: `${target}|similarPast`, label: "similar past moments led here", weight: inst.p1 });
      }
      if (base.length === 0) continue;

      let sumW = 0;
      let sumWRel = 0;
      const adjusted = base.map((f) => {
        const rel = factorReliability(stats, f.key);
        sumW += f.weight;
        sumWRel += f.weight * rel;
        return { key: f.key, label: f.label, weight: f.weight * rel };
      });
      const reliabilityBlend = sumW > 0 ? sumWRel / sumW : 1;
      const pFinal = clamp(p * reliabilityBlend, 0, 1);

      if (pFinal < FLOOR) continue;
      if (windowEnd < now) continue;
      if (predictedAt > now + MAX_AHEAD) continue;

      const factors = adjusted
        .filter((f) => f.weight > 0.01)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 4);
      const top = factors[0];
      const summary = `${TARGET_META[target].label}: ${top ? top.label : "routine pattern"}.`;
      const evidence = usedInstance
        ? `matched ${inst.matchedPoints} similar moments; target followed in ${inst.posCount}`
        : "physiological estimate (sparse history)";

      out.push({
        target,
        predictedAt,
        windowStart,
        windowEnd,
        probability: pFinal,
        summary,
        factors,
        evidence,
        context: nowCtx.features as Record<FeatureKey, number>,
      });
    }

    return out;
  },
};
