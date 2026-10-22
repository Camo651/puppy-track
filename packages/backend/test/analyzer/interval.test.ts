import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, seedFresh } from "../helpers/db";
import { MIN, regularSeries } from "../helpers/puppy-data";
import { candidateAt, THRESHOLD } from "../helpers/evaluator";
import { computeCandidates } from "../../src/analyzer/engine";

const BASE = Date.UTC(2026, 0, 5, 8, 0, 0);

describe("interval model", () => {
  beforeEach(() => resetDb());

  it("predicts the next event for a highly regular cadence with strong confidence", () => {
    // A pee almost exactly every 60 minutes.
    const pees = regularSeries("pee", { start: BASE, count: 24, periodMs: 60 * MIN, jitterMs: 3 * MIN, seed: 1 });
    const last = pees[pees.length - 1].occurredAt;
    const now = last + 30 * MIN;

    const c = candidateAt(pees, now, "pee");
    expect(c).not.toBeNull();
    expect(c!.confidence).toBeGreaterThan(0.6);
    // Next pee expected ~60 min after the last one.
    expect(Math.abs(c!.predictedAt - (last + 60 * MIN))).toBeLessThan(12 * MIN);
    expect(c!.windowStart).toBeLessThanOrEqual(last + 60 * MIN);
    expect(c!.windowEnd).toBeGreaterThanOrEqual(last + 60 * MIN);
  });

  it("is not confident when the cadence is erratic", () => {
    // Nominal 60 min but with huge variance: no dependable rhythm.
    const pees = regularSeries("pee", { start: BASE, count: 24, periodMs: 60 * MIN, jitterMs: 45 * MIN, seed: 2 });
    const last = pees[pees.length - 1].occurredAt;

    const c = candidateAt(pees, last + 20 * MIN, "pee");
    // It may still form a candidate, but confidence must stay below the
    // notification threshold so the puppy's humans are not spammed.
    if (c) expect(c.confidence).toBeLessThan(THRESHOLD);
  });

  it("needs at least four occurrences before guessing", () => {
    const pees = regularSeries("pee", { start: BASE, count: 3, periodMs: 60 * MIN, seed: 3 });
    const c = candidateAt(pees, pees[2].occurredAt + 30 * MIN, "pee");
    expect(c).toBeNull();
  });

  it("tracks a changing rhythm via recency weighting (puppy maturing)", () => {
    // Old habit: a pee every 150 min. Recent habit: every 40 min.
    const slow = regularSeries("pee", { start: BASE, count: 30, periodMs: 150 * MIN, seed: 4 });
    const slowEnd = slow[slow.length - 1].occurredAt;
    const fast = regularSeries("pee", {
      start: slowEnd + 40 * MIN,
      count: 50,
      periodMs: 40 * MIN,
      seed: 5,
    });
    const pees = [...slow, ...fast];
    const last = pees[pees.length - 1].occurredAt;

    seedFresh(pees);
    const c = computeCandidates(last + 20 * MIN).find((x) => x.eventType === "pee")!;
    expect(c).toBeTruthy();
    const predictedInterval = (c.predictedAt - last) / MIN;

    // The recency-weighted estimate must lean toward the recent 40-min rhythm,
    // well below the naive 95-min average of the two regimes.
    expect(predictedInterval).toBeLessThan(85);
    expect(Math.abs(predictedInterval - 40)).toBeLessThan(Math.abs(predictedInterval - 150));
  });

  it("gives tighter prediction windows for steadier data", () => {
    const steady = regularSeries("pee", { start: BASE, count: 24, periodMs: 60 * MIN, jitterMs: 3 * MIN, seed: 6 });
    const steadyC = candidateAt(steady, steady[steady.length - 1].occurredAt + 20 * MIN, "pee")!;

    const jumpy = regularSeries("pee", { start: BASE, count: 24, periodMs: 60 * MIN, jitterMs: 25 * MIN, seed: 7 });
    const jumpyC = candidateAt(jumpy, jumpy[jumpy.length - 1].occurredAt + 20 * MIN, "pee")!;

    const steadyWidth = steadyC.windowEnd - steadyC.windowStart;
    const jumpyWidth = jumpyC.windowEnd - jumpyC.windowStart;
    expect(steadyWidth).toBeLessThanOrEqual(jumpyWidth);
    expect(steadyC.confidence).toBeGreaterThan(jumpyC.confidence);
  });
});
