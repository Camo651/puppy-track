import { describe, expect, it } from "vitest";
import { contextEnsemble } from "../../../src/analyzer/models/context-ensemble";
import { modelPrediction } from "../../helpers/evaluator";
import { buildScenario, MIN } from "../../helpers/puppy-data";

// The same wake->pee episode should predict the same thing whether it happens at
// 6am or 8am: behavior is driven by the recent event sequence, not the clock.
const STEPS = [
  { type: "nap" as const, atMin: 6 * 60, durationMin: 45 },
  { type: "pee" as const, atMin: 6 * 60 + 55 },
  { type: "meal" as const, atMin: 7 * 60 + 30, amount: 70 },
];

describe("context-ensemble clock invariance", () => {
  const a = buildScenario(STEPS, { days: 12, seed: 6 });
  // Shift the entire history two hours later.
  const shift = 2 * 60 * MIN;
  const b = a.map((e) => ({
    ...e,
    occurredAt: e.occurredAt + shift,
    endedAt: e.endedAt != null ? e.endedAt + shift : e.endedAt,
  }));

  const DAY_MS = 24 * 60 * MIN;
  const start = a[0].occurredAt - (a[0].occurredAt % DAY_MS);
  const dayN = start + 11 * DAY_MS;
  const nowA = dayN + (6 * 60 + 47) * MIN; // just woke in scenario A
  const nowB = nowA + shift;

  it("gives the same pee prediction at 6am vs 8am", () => {
    const pa = modelPrediction(contextEnsemble, a, nowA, "pee");
    const pb = modelPrediction(contextEnsemble, b, nowB, "pee");

    expect(pa).toBeTruthy();
    expect(pb).toBeTruthy();
    expect(Math.abs(pa!.probability - pb!.probability)).toBeLessThan(0.1);
    const delayA = pa!.predictedAt - nowA;
    const delayB = pb!.predictedAt - nowB;
    expect(Math.abs(delayA - delayB)).toBeLessThan(10 * MIN);
  });
});
