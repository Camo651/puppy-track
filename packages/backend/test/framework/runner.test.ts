import { beforeEach, describe, expect, it } from "vitest";
import { db, inArray, predictions as predictionsTable } from "@puppy-track/db";
import { runOnce } from "../../src/analyzer/runner";
import { setChampionId } from "../../src/analyzer/champion";
import { resetDb, seedFresh } from "../helpers/db";
import { generatePuppyHistory, regularSeries, MIN, HOUR } from "../helpers/puppy-data";

function allPredictions() {
  return db.select().from(predictionsTable).all();
}

describe("runner (parallel models, champion-only notify)", () => {
  beforeEach(() => resetDb());

  it("runs every model and never notifies a shadow model", async () => {
    const { events, startMidnight } = generatePuppyHistory({ days: 12, seed: 4 });
    const now = startMidnight + 12 * 24 * HOUR - 3 * HOUR;
    seedFresh(events.filter((e) => e.occurredAt <= now));
    setChampionId("context-ensemble");

    await runOnce(now);

    const rows = allPredictions();
    expect(rows.length).toBeGreaterThan(0);
    const models = new Set(rows.map((r) => r.modelId));
    // All three models should have had a chance to store predictions.
    expect(models.size).toBeGreaterThanOrEqual(2);

    const notified = rows.filter((r) => r.status === "notified");
    for (const r of notified) expect(r.modelId).toBe("context-ensemble");
  });

  it("the champion notifies an imminent, confident forecast; shadows stay pending", async () => {
    const start = Date.UTC(2026, 0, 10, 6, 0, 0);
    const pees = regularSeries("pee", { start, count: 40, periodMs: 60 * MIN, jitterMs: 3 * MIN, seed: 2 });
    const last = pees[pees.length - 1].occurredAt;
    const now = last + 60 * MIN; // a pee is due right about now
    seedFresh(pees.filter((e) => e.occurredAt <= now));
    setChampionId("heuristic-v0");

    await runOnce(now);

    const rows = allPredictions();
    const notifiedPee = rows.find((r) => r.status === "notified" && r.eventType === "pee");
    expect(notifiedPee).toBeTruthy();
    expect(notifiedPee!.modelId).toBe("heuristic-v0");

    // Any other model's pee predictions must remain unsent.
    const shadowNotified = rows.filter((r) => r.status === "notified" && r.modelId !== "heuristic-v0");
    expect(shadowNotified.length).toBe(0);
  });

  it("dedupes: at most one open prediction per (model, target)", async () => {
    const { events, startMidnight } = generatePuppyHistory({ days: 12, seed: 7 });
    const now = startMidnight + 12 * 24 * HOUR - 3 * HOUR;
    seedFresh(events.filter((e) => e.occurredAt <= now));
    setChampionId("context-ensemble");

    await runOnce(now);
    await runOnce(now);

    const open = db
      .select()
      .from(predictionsTable)
      .where(inArray(predictionsTable.status, ["notified", "pending"]))
      .all();
    const seen = new Set<string>();
    for (const r of open) {
      const key = `${r.modelId}|${r.eventType}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
