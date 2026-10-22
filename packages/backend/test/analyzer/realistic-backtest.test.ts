import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { EventType } from "@puppy-track/common";
import { resetDb } from "../helpers/db";
import { DAY, generatePuppyHistory } from "../helpers/puppy-data";
import { backtestPrecision, backtestRecall, type RecallResult } from "../helpers/evaluator";

// 14 days of a routine-but-realistic ~12-week-old puppy. The first week warms
// up the models; evaluation happens over the back half.
const history = generatePuppyHistory({ days: 14, seed: 2026, noise: 1 });
const evalFrom = history.startMidnight + 8 * DAY;
const evalTo = history.startMidnight + 13 * DAY;

const recallSummary: RecallResult[] = [];
const recall = (type: EventType): RecallResult => {
  const r = backtestRecall(history.events, { type, from: evalFrom, to: evalTo });
  recallSummary.push(r);
  return r;
};

describe("realistic multi-day backtest", () => {
  beforeEach(() => resetDb());

  it("generates a plausible volume and mix of daily events", () => {
    const counts = new Map<EventType, number>();
    for (const e of history.events) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    const perDay = (t: EventType) => (counts.get(t) ?? 0) / 14;

    expect(perDay("pee")).toBeGreaterThan(6);
    expect(perDay("pee")).toBeLessThan(16);
    expect(perDay("poop")).toBeGreaterThan(1.5);
    expect(perDay("poop")).toBeLessThan(6);
    expect(perDay("meal")).toBeGreaterThan(2.5);
    expect(perDay("meal")).toBeLessThan(3.5);
    expect(perDay("nap")).toBeGreaterThan(3);
  });

  it("anticipates scheduled meals with low timing error", () => {
    const r = recall("meal");
    expect(r.total).toBeGreaterThan(10);
    expect(r.capabilityRecall).toBeGreaterThan(0.5);
    expect(r.notifyRecall).toBeGreaterThan(0);
    // When it does predict a meal, it is close.
    expect(r.meanAbsErrorMin).toBeLessThan(20);
  });

  it("anticipates most poops via meal/walk triggers", () => {
    const r = recall("poop");
    expect(r.total).toBeGreaterThan(8);
    expect(r.capabilityRecall).toBeGreaterThan(0.35);
  });

  it("anticipates a meaningful share of pees despite their variability", () => {
    const r = recall("pee");
    expect(r.total).toBeGreaterThan(40);
    // Pees are the hardest: many are off-schedule. We still anticipate a
    // worthwhile fraction without flooding (precision is checked below).
    expect(r.capabilityRecall).toBeGreaterThan(0.15);
  });

  it("anticipates water", () => {
    const r = recall("water");
    expect(r.capabilityRecall).toBeGreaterThan(0.2);
  });

  it("keeps notification precision reasonable during awake hours", () => {
    const { perType, overall } = backtestPrecision(history.events, {
      from: evalFrom,
      to: evalTo,
      stepMin: 20,
      types: ["pee", "poop", "meal", "water"],
      awakeHours: [7, 21],
    });

    // eslint-disable-next-line no-console
    console.log(
      "[backtest] precision:",
      [...perType.values()].map((p) => `${p.type}=${p.precision.toFixed(2)}(${p.truePositives}/${p.alerts})`).join(" "),
      `overall=${overall.precision.toFixed(2)}`,
    );

    expect(overall.alerts).toBeGreaterThan(10);
    // When the app fires a notification, a matching event usually follows.
    expect(overall.precision).toBeGreaterThan(0.6);
  });

  it("confidence threshold trades recall for little precision (calibration)", () => {
    const lowThr = 0.35;
    const highThr = 0.55;
    const low = backtestRecall(history.events, { type: "poop", from: evalFrom, to: evalTo, threshold: lowThr });
    const high = backtestRecall(history.events, { type: "poop", from: evalFrom, to: evalTo, threshold: highThr });

    const lowP = backtestPrecision(history.events, {
      from: evalFrom,
      to: evalTo,
      stepMin: 20,
      types: ["pee", "poop", "meal", "water"],
      awakeHours: [7, 21],
      threshold: lowThr,
    }).overall.precision;
    const highP = backtestPrecision(history.events, {
      from: evalFrom,
      to: evalTo,
      stepMin: 20,
      types: ["pee", "poop", "meal", "water"],
      awakeHours: [7, 21],
      threshold: highThr,
    }).overall.precision;

    // Raising the threshold decimates recall...
    expect(low.capabilityRecall).toBeGreaterThan(high.capabilityRecall + 0.3);
    // ...while barely moving precision, justifying the lower default.
    expect(Math.abs(lowP - highP)).toBeLessThan(0.15);
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log(
      "[backtest] recall (notify / capability):",
      recallSummary
        .map(
          (r) =>
            `${r.type}=${r.notifyRecall.toFixed(2)}/${r.capabilityRecall.toFixed(2)} ` +
            `conf≈${r.meanConfidence.toFixed(2)} err≈${r.meanAbsErrorMin.toFixed(0)}m`,
        )
        .join("  "),
    );
  });
});
