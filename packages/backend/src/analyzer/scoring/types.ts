import type { ModelScoreMetric, PredictionTarget } from "@puppy-track/common";

export interface ResolvedPrediction {
  target: PredictionTarget;
  probability: number;
  createdAt: number;
  predictedAt: number;
  windowStart: number;
  windowEnd: number;
  outcome: "hit" | "miss" | "pending";
  actualAt: number | null;
}

export interface RealTargetEvent {
  target: PredictionTarget;
  at: number;
}

// A pluggable metric over one model's resolved predictions (optionally a single
// target's subset). Adding a scorer is a new file implementing this plus one
// entry in the registry.
export interface Scorer {
  id: string;
  label: string;
  higherIsBetter: boolean;
  score(resolved: ResolvedPrediction[], realEvents: RealTargetEvent[]): ModelScoreMetric;
}
