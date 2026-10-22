import { beforeEach, describe, expect, it } from "vitest";
import { insertEvents, insertPredictions, resetDb } from "../helpers/db";
import { MIN, regularSeries } from "../helpers/puppy-data";
import { snapshotAt } from "../helpers/evaluator";
import { computeCandidates } from "../../src/analyzer/engine";

const BASE = Date.UTC(2026, 0, 5, 8, 0, 0);

function peeConfidenceWith(statuses: ("confirmed" | "denied")[]): number {
  const pees = regularSeries("pee", { start: BASE, count: 24, periodMs: 60 * MIN, jitterMs: 3 * MIN, seed: 1 });
  const last = pees[pees.length - 1].occurredAt;
  const now = last + 30 * MIN;

  resetDb();
  insertEvents(snapshotAt(pees, now));
  insertPredictions(
    statuses.map((status) => ({
      eventType: "pee" as const,
      windowStart: now - 2 * 60 * MIN,
      windowEnd: now - 60 * MIN,
      predictedAt: now - 90 * MIN,
      confidence: 0.7,
      status,
      createdAt: now - 24 * 60 * MIN,
    })),
  );
  const c = computeCandidates(now).find((x) => x.eventType === "pee");
  return c?.confidence ?? 0;
}

describe("feedback calibration", () => {
  beforeEach(() => resetDb());

  it("drags confidence down after repeated denials", () => {
    const base = peeConfidenceWith([]);
    const denied = peeConfidenceWith(["denied", "denied", "denied", "denied", "denied", "denied"]);
    expect(base).toBeGreaterThan(0.6);
    // Six straight denials => precision 0 => ~0.5x multiplier.
    expect(denied).toBeLessThan(base);
    expect(denied).toBeLessThan(base * 0.65);
  });

  it("keeps confidence high when predictions are confirmed", () => {
    const base = peeConfidenceWith([]);
    const confirmed = peeConfidenceWith(["confirmed", "confirmed", "confirmed", "confirmed"]);
    expect(Math.abs(confirmed - base)).toBeLessThan(0.02);
  });

  it("partial precision lands between the two extremes", () => {
    const base = peeConfidenceWith([]);
    const mixed = peeConfidenceWith(["confirmed", "confirmed", "denied", "denied"]);
    const denied = peeConfidenceWith(["denied", "denied", "denied", "denied"]);
    expect(mixed).toBeLessThan(base);
    expect(mixed).toBeGreaterThan(denied);
  });
});
