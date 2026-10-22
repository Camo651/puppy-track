import { beforeEach, describe, expect, it } from "vitest";
import { db, predictions as predictionsTable } from "@puppy-track/db";
import { expireAll, matchAll, targetsForEvent } from "../../src/analyzer/resolver";
import { insertEvents, insertPredictions, resetDb } from "../helpers/db";
import { MIN, HOUR } from "../helpers/puppy-data";

const BASE = Date.UTC(2026, 0, 10, 12, 0, 0);

describe("resolver", () => {
  beforeEach(() => resetDb());

  it("a real event confirms matching open predictions for every model", () => {
    const target = BASE;
    for (const modelId of ["heuristic-v0", "context-ensemble", "flow"]) {
      insertPredictions([
        {
          eventType: "pee",
          modelId,
          windowStart: target - 20 * MIN,
          windowEnd: target + 20 * MIN,
          predictedAt: target,
          confidence: 0.6,
          status: "pending",
          createdAt: target - HOUR,
        },
      ]);
    }
    insertEvents([{ type: "pee", occurredAt: target }]);
    const peeId = db.select().from(predictionsTable).all(); // ensure rows exist
    expect(peeId.length).toBe(3);

    const matched = matchAll({ id: "real-pee", type: "pee", occurredAt: target });
    expect(matched).toBe(3);
    const rows = db.select().from(predictionsTable).all();
    expect(rows.every((r) => r.status === "confirmed")).toBe(true);
  });

  it("expires long-past open predictions as misses", () => {
    insertPredictions([
      {
        eventType: "poop",
        modelId: "context-ensemble",
        windowStart: BASE - 6 * HOUR,
        windowEnd: BASE - 5 * HOUR,
        predictedAt: BASE - 5.5 * HOUR,
        confidence: 0.5,
        status: "pending",
        createdAt: BASE - 7 * HOUR,
      },
    ]);
    const expired = expireAll(BASE);
    expect(expired).toBe(1);
    expect(db.select().from(predictionsTable).all()[0].status).toBe("expired");
  });

  it("detects energy_high and energy_low crossings from the energy sequence", () => {
    insertEvents([
      { type: "energy", occurredAt: BASE, amount: 3 },
      { type: "energy", occurredAt: BASE + 30 * MIN, amount: 5 },
      { type: "energy", occurredAt: BASE + 90 * MIN, amount: 0 },
    ]);

    expect(targetsForEvent({ id: "e-high", type: "energy", occurredAt: BASE + 30 * MIN, amount: 5 })).toEqual([
      "energy_high",
    ]);
    expect(targetsForEvent({ id: "e-low", type: "energy", occurredAt: BASE + 90 * MIN, amount: 0 })).toEqual([
      "energy_low",
    ]);
    // A move that stays mid-range is not a crossing.
    expect(targetsForEvent({ id: "e-mid", type: "energy", occurredAt: BASE + 30 * MIN, amount: 3 })).toEqual([]);
  });
});
