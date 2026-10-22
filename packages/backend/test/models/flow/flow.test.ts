import { describe, expect, it } from "vitest";
import { flow } from "../../../src/analyzer/models/flow";
import { predictWith } from "../../helpers/evaluator";
import { generatePuppyHistory, DAY, HOUR, MIN } from "../../helpers/puppy-data";
import type { SeedEvent } from "../../helpers/db";

describe("flow model", () => {
  it("produces a sane pee forecast on routine data", () => {
    const { events, startMidnight } = generatePuppyHistory({ days: 12, seed: 5 });
    // Probe right after a mid-morning nap on a fresh day, when a pee is due.
    const dayN = startMidnight + 12 * DAY;
    const now = dayN + (9 * 60 + 30) * MIN;
    const scenario: SeedEvent[] = [
      ...events.filter((e) => e.occurredAt < dayN),
      { type: "nap", occurredAt: dayN + 8 * HOUR, endedAt: now - 2 * MIN },
    ];

    const preds = predictWith(flow, scenario, now);
    expect(Array.isArray(preds)).toBe(true);
    const pee = preds.find((p) => p.target === "pee");
    if (pee) {
      expect(pee.probability).toBeGreaterThan(0);
      expect(pee.probability).toBeLessThanOrEqual(1);
      expect(pee.windowEnd).toBeGreaterThanOrEqual(pee.windowStart);
    }
  });

  it("does not crash on sparse cold-start data", () => {
    const start = Date.UTC(2026, 0, 6, 7, 0, 0);
    const events: SeedEvent[] = [
      { type: "pee", occurredAt: start },
      { type: "water", occurredAt: start + 30 * MIN, amount: 100 },
      { type: "pee", occurredAt: start + 70 * MIN },
      { type: "meal", occurredAt: start + 2 * HOUR, amount: 70 },
      { type: "pee", occurredAt: start + 3 * HOUR },
    ];
    const preds = predictWith(flow, events, start + 4 * HOUR);
    expect(Array.isArray(preds)).toBe(true);
  });
});
