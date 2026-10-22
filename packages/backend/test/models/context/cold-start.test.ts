import { describe, expect, it } from "vitest";
import { contextEnsemble } from "../../../src/analyzer/models/context-ensemble";
import { modelPrediction } from "../../helpers/evaluator";
import { MIN, HOUR } from "../../helpers/puppy-data";
import type { SeedEvent } from "../../helpers/db";

// With only a few days of data the instance model has little to go on, but the
// physiological hazard should still flag a pee after a long dry spell + water.
describe("context-ensemble cold start", () => {
  const start = Date.UTC(2026, 0, 6, 7, 0, 0);
  const events: SeedEvent[] = [];
  // Three sparse days of pees roughly every 70 minutes while awake.
  for (let d = 0; d < 3; d++) {
    for (let m = 0; m < 10; m++) {
      events.push({ type: "pee", occurredAt: start + d * 24 * HOUR + m * 72 * MIN });
    }
  }

  it("predicts a pee from hazard after a long gap + recent water", () => {
    const now = start + 3 * 24 * HOUR + 2 * HOUR;
    events.push({ type: "pee", occurredAt: now - 120 * MIN });
    events.push({ type: "water", occurredAt: now - 20 * MIN, amount: 160 });

    const pee = modelPrediction(contextEnsemble, events, now, "pee");
    expect(pee).toBeTruthy();
    expect(pee!.probability).toBeGreaterThan(0.4);
  });
});
