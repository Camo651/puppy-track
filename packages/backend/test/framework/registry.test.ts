import { describe, expect, it } from "vitest";
import { modelRegistry } from "../../src/analyzer/models";
import { resetDb } from "../helpers/db";
import { generatePuppyHistory } from "../helpers/puppy-data";
import { modelSnapshot } from "../helpers/evaluator";

describe("model registry", () => {
  it("has unique model ids", () => {
    const ids = modelRegistry.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("heuristic-v0");
    expect(ids).toContain("context-ensemble");
    expect(ids).toContain("flow");
  });

  it("every model is deterministic and does not mutate the snapshot", () => {
    const { events, startMidnight } = generatePuppyHistory({ days: 10, seed: 5 });
    const now = startMidnight + 10 * 24 * 60 * 60_000 - 4 * 60 * 60_000;

    for (const model of modelRegistry) {
      resetDb();
      const snap = modelSnapshot(events, now);
      const before = JSON.stringify(snap.events);
      const a = model.predict(snap);
      const afterMutationCheck = JSON.stringify(snap.events);
      const b = model.predict(snap);

      expect(afterMutationCheck).toBe(before); // snapshot untouched
      expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // deterministic
    }
  });

  it("every prediction targets a known target with a valid probability and window", () => {
    const { events, startMidnight } = generatePuppyHistory({ days: 10, seed: 9 });
    const now = startMidnight + 10 * 24 * 60 * 60_000 - 6 * 60 * 60_000;
    const valid = new Set(["pee", "poop", "nap", "energy_high", "energy_low"]);

    for (const model of modelRegistry) {
      resetDb();
      for (const p of model.predict(modelSnapshot(events, now))) {
        expect(valid.has(p.target)).toBe(true);
        expect(p.probability).toBeGreaterThanOrEqual(0);
        expect(p.probability).toBeLessThanOrEqual(1);
        expect(p.windowEnd).toBeGreaterThanOrEqual(p.windowStart);
      }
    }
  });
});
