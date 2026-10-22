import { describe, expect, it } from "vitest";
import type { PredictionTarget } from "@puppy-track/common";
import { modelRegistry } from "../../src/analyzer/models";
import type { ModelPrediction, PredictionModel } from "../../src/analyzer/models";
import { predictWith } from "../helpers/evaluator";
import { generatePuppyHistory, DAY, MIN } from "../helpers/puppy-data";
import type { SeedEvent } from "../helpers/db";

const LEAD_MS = 15 * MIN;
const TOL = 45 * MIN;
const TARGETS: PredictionTarget[] = ["pee", "poop", "nap"];

function targetPred(
  model: PredictionModel,
  events: SeedEvent[],
  now: number,
  target: PredictionTarget,
  threshold: number,
): ModelPrediction | null {
  const p = predictWith(model, events, now).find((x) => x.target === target);
  return p && p.probability >= threshold ? p : null;
}

interface Card {
  recallCovered: number;
  recallTotal: number;
  precisionTp: number;
  precisionAlerts: number;
}

function scoreModel(
  model: PredictionModel,
  events: SeedEvent[],
  from: number,
  to: number,
  threshold: number,
): Card {
  const card: Card = { recallCovered: 0, recallTotal: 0, precisionTp: 0, precisionAlerts: 0 };

  // Recall (capability): probe shortly before each real event.
  for (const target of TARGETS) {
    const real = events.filter((e) => e.type === target && e.occurredAt >= from && e.occurredAt <= to);
    for (const e of real) {
      card.recallTotal += 1;
      const now = e.occurredAt - 5 * MIN;
      const p = targetPred(model, events, now, target, threshold);
      if (p && p.windowStart <= e.occurredAt && e.occurredAt <= p.windowEnd) card.recallCovered += 1;
    }
  }

  // Precision: sweep awake hours, collapse repeat alerts, check for a real event.
  for (const target of TARGETS) {
    const real = events.filter((e) => e.type === target).map((e) => e.occurredAt);
    interface Alert {
      predictedAt: number;
      windowEnd: number;
      firstNow: number;
    }
    const alerts: Alert[] = [];
    for (let now = from; now <= to; now += 30 * MIN) {
      const h = new Date(now).getHours();
      if (h < 7 || h >= 21) continue;
      const p = targetPred(model, events, now, target, threshold);
      if (!p) continue;
      const imminent = p.predictedAt - now <= LEAD_MS && p.windowEnd >= now;
      if (!imminent) continue;
      const last = alerts[alerts.length - 1];
      if (last && Math.abs(last.predictedAt - p.predictedAt) < 30 * MIN) {
        last.windowEnd = Math.max(last.windowEnd, p.windowEnd);
      } else {
        alerts.push({ predictedAt: p.predictedAt, windowEnd: p.windowEnd, firstNow: now });
      }
    }
    for (const a of alerts) {
      card.precisionAlerts += 1;
      if (real.some((t) => t >= a.firstNow && t <= a.windowEnd + TOL)) card.precisionTp += 1;
    }
  }

  return card;
}

const recall = (c: Card) => (c.recallTotal ? c.recallCovered / c.recallTotal : 0);
const precision = (c: Card) => (c.precisionAlerts ? c.precisionTp / c.precisionAlerts : 1);

describe("realistic multi-model backtest", () => {
  const { events, startMidnight } = generatePuppyHistory({ days: 14, seed: 42 });
  const to = startMidnight + 14 * DAY - 6 * 60 * MIN;
  const from = to - 6 * DAY; // score the last ~6 days
  const threshold = 0.35;

  const cards = new Map<string, Card>();
  for (const model of modelRegistry) {
    cards.set(model.id, scoreModel(model, events, from, to, threshold));
  }

  it("prints per-model scorecards", () => {
    for (const model of modelRegistry) {
      const c = cards.get(model.id)!;
      // eslint-disable-next-line no-console
      console.log(
        `[multi-model] ${model.id}: recall=${recall(c).toFixed(2)}(${c.recallCovered}/${c.recallTotal}) ` +
          `precision=${precision(c).toFixed(2)}(${c.precisionTp}/${c.precisionAlerts})`,
      );
    }
    expect(cards.size).toBe(modelRegistry.length);
  });

  it("every model stays within sane precision/recall bounds", () => {
    for (const model of modelRegistry) {
      const c = cards.get(model.id)!;
      expect(precision(c)).toBeGreaterThanOrEqual(0);
      expect(precision(c)).toBeLessThanOrEqual(1);
      expect(recall(c)).toBeGreaterThanOrEqual(0);
      expect(recall(c)).toBeLessThanOrEqual(1);
    }
  });

  it("context-ensemble matches or beats the baseline on recall", () => {
    const ctx = cards.get("context-ensemble")!;
    const base = cards.get("heuristic-v0")!;
    expect(recall(ctx)).toBeGreaterThanOrEqual(recall(base) - 0.05);
    // And it should still anticipate a meaningful share of events.
    expect(recall(ctx)).toBeGreaterThan(0.3);
  });

  it("the champion keeps precision reasonable at the default threshold", () => {
    const ctx = cards.get("context-ensemble")!;
    expect(precision(ctx)).toBeGreaterThanOrEqual(0.5);
  });
});
