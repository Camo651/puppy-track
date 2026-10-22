import { describe, expect, it } from "vitest";
import { contextEnsemble } from "../../../src/analyzer/models/context-ensemble";
import { modelPrediction } from "../../helpers/evaluator";
import { buildScenario, MIN } from "../../helpers/puppy-data";

// A daily routine that teaches two chains:
//  - wake -> energy spike (zoomies)
//  - big meal -> energy crash -> nap
const STEPS = [
  { type: "nap" as const, atMin: 8 * 60, durationMin: 60 },
  { type: "energy" as const, atMin: 8 * 60 + 1, amount: 0 },
  { type: "energy" as const, atMin: 9 * 60 + 5, amount: 5 }, // crosses into high after waking
  { type: "pee" as const, atMin: 9 * 60 + 8 },
  { type: "meal" as const, atMin: 10 * 60, amount: 80 },
  { type: "energy" as const, atMin: 10 * 60 + 50, amount: 1 }, // crosses into low after eating
  { type: "nap" as const, atMin: 11 * 60, durationMin: 60 },
];

describe("context-ensemble energy coupling", () => {
  const events = buildScenario(STEPS, { days: 15, seed: 8 });
  const startMidnight = events[0].occurredAt - (events[0].occurredAt % (24 * 60 * MIN));
  const DAY_MS = 24 * 60 * MIN;
  const dayN = startMidnight + 14 * DAY_MS;

  it("predicts the zoomies shortly after waking", () => {
    const now = dayN + (9 * 60 + 2) * MIN; // just woke, before the usual spike
    const high = modelPrediction(contextEnsemble, events, now, "energy_high");
    expect(high).toBeTruthy();
    expect(high!.probability).toBeGreaterThan(0.3);
  });

  it("predicts a nap after a big meal + low energy", () => {
    const now = dayN + (10 * 60 + 55) * MIN; // after meal, energy just dropped low
    const nap = modelPrediction(contextEnsemble, events, now, "nap");
    expect(nap).toBeTruthy();
    expect(nap!.probability).toBeGreaterThan(0.4);
  });
});
