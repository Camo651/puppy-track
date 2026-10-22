import type { PredictionTarget } from "@puppy-track/common";
import { computeCandidatesFromRows } from "../../engine";
import type { EventSnapshot, ModelPrediction, PredictionModel } from "../types";

const TARGETS: PredictionTarget[] = ["pee", "poop", "nap"];

// Baseline model: the original interval/recurrence/trigger engine, run purely
// over the snapshot and surfaced through the plugin contract. It only forecasts
// the directly-logged targets (pee/poop/nap); energy targets are left to the
// richer models.
export const heuristicV0: PredictionModel = {
  id: "heuristic-v0",
  label: "Heuristic v0 (baseline)",
  version: 1,
  predict(snap: EventSnapshot): ModelPrediction[] {
    const candidates = computeCandidatesFromRows(snap.events, snap.now);
    return candidates
      .filter((c) => (TARGETS as string[]).includes(c.eventType))
      .map((c) => ({
        target: c.eventType as PredictionTarget,
        predictedAt: c.predictedAt,
        windowStart: c.windowStart,
        windowEnd: c.windowEnd,
        probability: c.confidence,
        summary: c.basis.summary,
        factors: [],
      }));
  },
};
