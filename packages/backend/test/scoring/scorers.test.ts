import { describe, expect, it } from "vitest";
import { scorerRegistry } from "../../src/analyzer/scoring";
import type { RealTargetEvent, ResolvedPrediction } from "../../src/analyzer/scoring/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const T = Date.UTC(2026, 0, 10, 12, 0, 0);

function scorer(id: string) {
  const s = scorerRegistry.find((x) => x.id === id);
  if (!s) throw new Error(`missing scorer ${id}`);
  return s;
}

const resolved: ResolvedPrediction[] = [
  {
    target: "pee",
    probability: 0.8,
    createdAt: T - 30 * MIN,
    predictedAt: T,
    windowStart: T - 10 * MIN,
    windowEnd: T + 10 * MIN,
    outcome: "hit",
    actualAt: T,
  },
  {
    target: "pee",
    probability: 0.6,
    createdAt: T + 2 * HOUR,
    predictedAt: T + 3 * HOUR,
    windowStart: T + 3 * HOUR - 10 * MIN,
    windowEnd: T + 3 * HOUR + 10 * MIN,
    outcome: "miss",
    actualAt: null,
  },
  {
    target: "pee",
    probability: 0.4,
    createdAt: T + 5 * HOUR,
    predictedAt: T + 6 * HOUR,
    windowStart: T + 6 * HOUR,
    windowEnd: T + 6 * HOUR + 10 * MIN,
    outcome: "pending",
    actualAt: null,
  },
];

const realEvents: RealTargetEvent[] = [
  { target: "pee", at: T }, // covered by the first prediction's window
  { target: "pee", at: T + 20 * HOUR }, // covered by nothing
];

describe("scorers", () => {
  it("precision = hits / resolved", () => {
    const m = scorer("precision").score(resolved, realEvents);
    expect(m.value).toBeCloseTo(0.5, 6); // 1 hit out of 2 resolved
    expect(m.detail).toBe("1/2");
  });

  it("recall = covered real events / total", () => {
    const m = scorer("recall").score(resolved, realEvents);
    expect(m.value).toBeCloseTo(0.5, 6); // 1 of 2 covered
  });

  it("leadTime = mean minutes of warning on hits", () => {
    const m = scorer("leadTime").score(resolved, realEvents);
    expect(m.value).toBeCloseTo(30, 6); // actualAt - createdAt = 30 min
  });

  it("calibration = Brier over resolved (lower better)", () => {
    const m = scorer("calibration").score(resolved, realEvents);
    // ((0.8-1)^2 + (0.6-0)^2) / 2 = (0.04 + 0.36)/2 = 0.2
    expect(m.value).toBeCloseTo(0.2, 6);
    expect(m.higherIsBetter).toBe(false);
  });
});
