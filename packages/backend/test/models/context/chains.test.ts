import { describe, expect, it } from "vitest";
import { contextEnsemble } from "../../../src/analyzer/models/context-ensemble";
import { modelPrediction } from "../../helpers/evaluator";
import { generatePuppyHistory, DAY, MIN } from "../../helpers/puppy-data";
import type { SeedEvent } from "../../helpers/db";

// Ordering matters: water -> nap -> (wake) should leave a full bladder, so a pee
// is likely right after the nap. But water -> pee -> nap means the bladder was
// emptied before sleeping, so waking is NOT followed by another pee.
describe("context-ensemble chain discrimination", () => {
  const { events: train, startMidnight } = generatePuppyHistory({ days: 12, seed: 3 });
  const base = train.filter((e) => e.occurredAt < startMidnight + 12 * DAY);
  const dayN = startMidnight + 12 * DAY;
  const now = dayN + (10 * 60 + 15) * MIN; // 10:15, just woke from a mid-morning nap

  const waterAt = dayN + 9 * 60 * MIN;
  const napStart = dayN + (9 * 60 + 30) * MIN;
  const napEnd = now - MIN;

  const wet: SeedEvent[] = [
    ...base,
    { type: "water", occurredAt: waterAt, amount: 120 },
    { type: "nap", occurredAt: napStart, endedAt: napEnd },
  ];
  // Same, but a pee happened just before the nap (bladder emptied).
  const dry: SeedEvent[] = [
    ...base,
    { type: "water", occurredAt: waterAt, amount: 120 },
    { type: "pee", occurredAt: napStart - 2 * MIN },
    { type: "nap", occurredAt: napStart, endedAt: napEnd },
  ];

  it("predicts pee after water->nap, but not after water->pee->nap", () => {
    const wetPee = modelPrediction(contextEnsemble, wet, now, "pee");
    const dryPee = modelPrediction(contextEnsemble, dry, now, "pee");

    expect(wetPee).toBeTruthy();
    expect(wetPee!.probability).toBeGreaterThan(0.5);

    const dryProb = dryPee?.probability ?? 0;
    expect(dryProb).toBeLessThan(0.45);
    expect(wetPee!.probability - dryProb).toBeGreaterThan(0.2);
  });

  it("attributes the post-nap pee to bladder-related factors", () => {
    const wetPee = modelPrediction(contextEnsemble, wet, now, "pee");
    const keys = (wetPee?.factors ?? []).map((f) => f.key);
    expect(keys.some((k) => k === "pee|sinceLastPee" || k === "pee|waterSincePee")).toBe(true);
  });
});
