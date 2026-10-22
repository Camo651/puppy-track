import { DEFAULT_ENERGY, type PredictionTarget } from "@puppy-track/common";

// Minimal event shape these helpers need. Works for both EventRow and DB rows.
export interface TargetEvent {
  type: string;
  occurredAt: number;
  amount?: number | null;
}

const ENERGY_HIGH = 4;
const ENERGY_LOW = 1;

// Times at which energy crossed up into "high" (>=4) or down into "low" (<=1),
// derived from the sequence of energy events. The first energy reading is
// compared against the resting default so an opening spike/crash still counts.
export function energyCrossingTimes(events: TargetEvent[]): { high: number[]; low: number[] } {
  const energy = events
    .filter((e) => e.type === "energy")
    .sort((a, b) => a.occurredAt - b.occurredAt);
  const high: number[] = [];
  const low: number[] = [];
  let prev = DEFAULT_ENERGY;
  for (const e of energy) {
    const cur = e.amount ?? DEFAULT_ENERGY;
    if (prev < ENERGY_HIGH && cur >= ENERGY_HIGH) high.push(e.occurredAt);
    if (prev > ENERGY_LOW && cur <= ENERGY_LOW) low.push(e.occurredAt);
    prev = cur;
  }
  return { high, low };
}

// All moments (sorted asc) that count as a real occurrence of `target`.
export function realTargetTimes(events: TargetEvent[], target: PredictionTarget): number[] {
  if (target === "energy_high") return energyCrossingTimes(events).high;
  if (target === "energy_low") return energyCrossingTimes(events).low;
  const type = target; // pee | poop | nap
  return events
    .filter((e) => e.type === type)
    .map((e) => e.occurredAt)
    .sort((a, b) => a - b);
}
