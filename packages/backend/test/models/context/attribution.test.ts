import { beforeEach, describe, expect, it } from "vitest";
import {
  factorReliability,
  loadFactorStats,
} from "../../../src/analyzer/models/context-ensemble/reliability";
import { insertPredictions, resetDb } from "../../helpers/db";
import { HOUR, MIN } from "../../helpers/puppy-data";

const NOW = Date.UTC(2026, 0, 12, 12, 0, 0);

function seed(key: string, status: "confirmed" | "denied", n: number) {
  for (let i = 0; i < n; i++) {
    insertPredictions([
      {
        eventType: "pee",
        modelId: "context-ensemble",
        windowStart: NOW - 2 * HOUR,
        windowEnd: NOW - 2 * HOUR + 20 * MIN,
        predictedAt: NOW - 2 * HOUR,
        confidence: 0.6,
        status,
        factors: [{ key, label: key, weight: 1 }],
        createdAt: NOW - 3 * HOUR - i * MIN,
      },
    ]);
  }
}

describe("context-ensemble factor reliability", () => {
  beforeEach(() => resetDb());

  it("denials lower a factor's reliability; confirmations keep it high; unrelated stay neutral", () => {
    seed("pee|waterSincePee", "denied", 3);
    seed("pee|sinceLastPee", "confirmed", 2);

    const stats = loadFactorStats("context-ensemble", NOW);
    const denied = factorReliability(stats, "pee|waterSincePee");
    const confirmed = factorReliability(stats, "pee|sinceLastPee");
    const unrelated = factorReliability(stats, "poop|mealsSincePoop");

    expect(denied).toBeCloseTo(0.25, 6); // (0+1)/(0+3+1)
    expect(confirmed).toBeCloseTo(1.0, 6); // (2+1)/(2+0+1)
    expect(unrelated).toBe(1); // no evidence -> neutral
    expect(denied).toBeLessThan(confirmed);
  });

  it("only counts this model's resolved predictions", () => {
    seed("pee|waterSincePee", "denied", 2);
    // Same factor, different model -> ignored.
    insertPredictions([
      {
        eventType: "pee",
        modelId: "flow",
        windowStart: NOW - 2 * HOUR,
        windowEnd: NOW - 2 * HOUR + 20 * MIN,
        predictedAt: NOW - 2 * HOUR,
        confidence: 0.6,
        status: "confirmed",
        factors: [{ key: "pee|waterSincePee", label: "x", weight: 1 }],
        createdAt: NOW - 3 * HOUR,
      },
    ]);

    const stats = loadFactorStats("context-ensemble", NOW);
    expect(stats.get("pee|waterSincePee")).toEqual({ hits: 0, miss: 2 });
  });
});
