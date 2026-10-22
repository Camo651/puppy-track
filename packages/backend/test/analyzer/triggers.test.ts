import { describe, expect, it } from "vitest";
import type { EventType } from "@puppy-track/common";
import type { SeedEvent } from "../helpers/db";
import { DAY, HOUR, MIN, makeRng } from "../helpers/puppy-data";
import { rowsAt, THRESHOLD } from "../helpers/evaluator";
import { triggerCandidate, type TriggerDef } from "../../src/analyzer/engine";

const BASE = Date.UTC(2026, 0, 5, 7, 0, 0);

/**
 * Triggers at random gaps (so the target has no rhythm of its own), each
 * followed by a target after a steady delay. This isolates the trigger model:
 * the only learnable signal is "target follows trigger by ~delay".
 */
function triggerPairs(
  trigger: EventType,
  target: EventType,
  opts: {
    days: number;
    perDay?: number;
    delayMin: number;
    delaySigmaMin?: number;
    triggerDurationMin?: number;
    targetChance?: number;
    seed?: number;
  },
): SeedEvent[] {
  const rng = makeRng(opts.seed ?? 21);
  const perDay = opts.perDay ?? 4;
  const out: SeedEvent[] = [];
  for (let d = 0; d < opts.days; d++) {
    let t = BASE + d * DAY + 30 * MIN * rng();
    for (let i = 0; i < perDay; i++) {
      const endedAt =
        opts.triggerDurationMin != null ? t + opts.triggerDurationMin * MIN : undefined;
      out.push({ type: trigger, occurredAt: t, endedAt });
      const moment = endedAt ?? t;
      if (rng() < (opts.targetChance ?? 1)) {
        const delay = (opts.delayMin + (rng() - 0.5) * 2 * (opts.delaySigmaMin ?? 4)) * MIN;
        out.push({ type: target, occurredAt: moment + Math.max(MIN, delay) });
      }
      t += (2.5 + rng() * 5) * HOUR; // random spacing between triggers
    }
  }
  out.sort((a, b) => a.occurredAt - b.occurredAt);
  return out;
}

function lastTrigger(events: SeedEvent[], type: EventType): SeedEvent {
  return [...events].reverse().find((e) => e.type === type)!;
}

describe("trigger model (unit)", () => {
  it("learns meal -> poop (gastrocolic reflex) and predicts the pending poop", () => {
    const def: TriggerDef = { trigger: "meal", target: "poop", maxDelay: 4 * HOUR };
    const events = triggerPairs("meal", "poop", { days: 7, delayMin: 22, delaySigmaMin: 5, seed: 31 });
    const meal = lastTrigger(events, "meal");
    const now = meal.occurredAt + 10 * MIN; // its poop (+22) hasn't happened yet

    const c = triggerCandidate(def, rowsAt(events, now), now)!;
    expect(c).toBeTruthy();
    expect(c.eventType).toBe("poop");
    expect(c.confidence).toBeGreaterThanOrEqual(0.55);
    expect(Math.abs(c.predictedAt - (meal.occurredAt + 22 * MIN))).toBeLessThan(12 * MIN);
    expect(c.basis.signals.join(" ")).toContain("trigger model: meal -> poop");
  });

  it("learns wake (nap end) -> pee using the span END time, not its start", () => {
    const def: TriggerDef = { trigger: "nap", target: "pee", maxDelay: 45 * MIN };
    const events = triggerPairs("nap", "pee", {
      days: 7,
      delayMin: 8,
      delaySigmaMin: 3,
      triggerDurationMin: 60,
      seed: 32,
    });
    const nap = lastTrigger(events, "nap");
    const wake = nap.endedAt!;
    const now = wake + 3 * MIN;

    const c = triggerCandidate(def, rowsAt(events, now), now)!;
    expect(c).toBeTruthy();
    // Prediction is anchored to the wake time (~8 min after), i.e. ~68 min
    // after the nap STARTED — proving span end, not start, drives the trigger.
    expect(Math.abs(c.predictedAt - (wake + 8 * MIN))).toBeLessThan(8 * MIN);
    expect(c.predictedAt - nap.occurredAt).toBeGreaterThan(60 * MIN);
    expect(c.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it("learns water -> pee", () => {
    const def: TriggerDef = { trigger: "water", target: "pee", maxDelay: 2 * HOUR };
    const events = triggerPairs("water", "pee", { days: 7, delayMin: 40, delaySigmaMin: 8, seed: 33 });
    const water = lastTrigger(events, "water");
    const now = water.occurredAt + 10 * MIN;

    const c = triggerCandidate(def, rowsAt(events, now), now)!;
    expect(c).toBeTruthy();
    expect(c.confidence).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(c.predictedAt - (water.occurredAt + 40 * MIN))).toBeLessThan(15 * MIN);
  });

  it("learns walk -> poop off the walk end", () => {
    const def: TriggerDef = { trigger: "walk", target: "poop", maxDelay: 45 * MIN };
    const events = triggerPairs("walk", "poop", {
      days: 7,
      delayMin: 6,
      delaySigmaMin: 3,
      triggerDurationMin: 25,
      seed: 34,
    });
    const walk = lastTrigger(events, "walk");
    const now = walk.endedAt! + 2 * MIN;

    const c = triggerCandidate(def, rowsAt(events, now), now)!;
    expect(c).toBeTruthy();
    expect(c.confidence).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(c.predictedAt - (walk.endedAt! + 6 * MIN))).toBeLessThan(10 * MIN);
  });

  it("stays unconfident when the target is unrelated to the trigger", () => {
    const def: TriggerDef = { trigger: "meal", target: "poop", maxDelay: 4 * HOUR };
    const rng = makeRng(99);
    const events: SeedEvent[] = [];
    for (let d = 0; d < 7; d++) {
      const base = BASE + d * DAY;
      for (const h of [0, 4, 9]) events.push({ type: "meal", occurredAt: base + h * HOUR });
      for (let k = 0; k < 4; k++) events.push({ type: "poop", occurredAt: base + rng() * 12 * HOUR });
    }
    events.sort((a, b) => a.occurredAt - b.occurredAt);
    const now = lastTrigger(events, "meal").occurredAt + 10 * MIN;

    const c = triggerCandidate(def, rowsAt(events, now), now);
    if (c) expect(c.confidence).toBeLessThan(THRESHOLD);
  });

  it("returns null without enough trigger/target history", () => {
    const def: TriggerDef = { trigger: "meal", target: "poop", maxDelay: 4 * HOUR };
    const events = triggerPairs("meal", "poop", { days: 1, perDay: 2, delayMin: 22, seed: 7 });
    const now = lastTrigger(events, "meal").occurredAt + 10 * MIN;
    expect(triggerCandidate(def, rowsAt(events, now), now)).toBeNull();
  });
});
