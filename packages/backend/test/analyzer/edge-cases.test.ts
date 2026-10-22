import { beforeEach, describe, expect, it } from "vitest";
import type { SeedEvent } from "../helpers/db";
import { resetDb } from "../helpers/db";
import { DAY, MIN, regularSeries } from "../helpers/puppy-data";
import { candidateAt, candidatesAt } from "../helpers/evaluator";
import { computeCandidates } from "../../src/analyzer/engine";

const BASE = Date.UTC(2026, 0, 5, 7, 0, 0);

describe("edge cases and invariants", () => {
  beforeEach(() => resetDb());

  it("produces no candidates on an empty history", () => {
    expect(computeCandidates(Date.now())).toEqual([]);
  });

  it("every candidate is internally consistent", () => {
    const pees = regularSeries("pee", { start: BASE, count: 24, periodMs: 60 * MIN, jitterMs: 4 * MIN, seed: 1 });
    const now = pees[pees.length - 1].occurredAt + 20 * MIN;
    const candidates = candidatesAt(pees, now);
    expect(candidates.length).toBeGreaterThan(0);
    for (const c of candidates) {
      expect(c.confidence).toBeGreaterThanOrEqual(0);
      expect(c.confidence).toBeLessThanOrEqual(1);
      expect(c.windowStart).toBeLessThanOrEqual(c.predictedAt);
      expect(c.predictedAt).toBeLessThanOrEqual(c.windowEnd);
      expect(c.basis.summary.length).toBeGreaterThan(0);
    }
  });

  it("overnight gaps weaken the pure interval model (a real limitation)", () => {
    // Continuous steady cadence.
    const continuous = regularSeries("pee", { start: BASE, count: 48, periodMs: 70 * MIN, jitterMs: 6 * MIN, seed: 2 });
    const contC = candidateAt(continuous, continuous[continuous.length - 1].occurredAt + 20 * MIN, "pee")!;

    // Same daytime cadence, but the puppy sleeps through the night, injecting a
    // ~10h gap into the interval stream every day.
    const gapped: SeedEvent[] = [];
    for (let d = 0; d < 6; d++) {
      const dayStart = BASE + d * DAY;
      for (let m = 0; m <= 14 * 60; m += 70) {
        gapped.push({ type: "pee", occurredAt: dayStart + m * MIN + (m % 3) * MIN });
      }
    }
    const gapC = candidateAt(gapped, gapped[gapped.length - 1].occurredAt + 20 * MIN, "pee")!;

    expect(contC.confidence).toBeGreaterThan(gapC.confidence);
  });

  it("ignores stale intervals older than the lookback window", () => {
    // Events from 30 days ago (beyond the 21-day lookback) must not count.
    const stale = regularSeries("pee", {
      start: BASE - 30 * DAY,
      count: 10,
      periodMs: 60 * MIN,
      seed: 3,
    });
    // Probe between the last event and the next predicted one (window still live).
    const now = BASE - 30 * DAY + 9 * 60 * MIN + 30 * MIN;
    const c = candidateAt(stale, now, "pee");
    // `now` here is itself 30 days before BASE, but computeCandidates always
    // looks back from its own `now`; probing at "today" there is no data.
    const today = candidateAt(stale, Date.now(), "pee");
    expect(today).toBeNull();
    // Sanity: at the historical moment the data is visible.
    expect(c).not.toBeNull();
  });
});
