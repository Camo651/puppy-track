import type { Scorer } from "../types";

// Brier score: mean squared error between stated probability and outcome.
// Lower is better.
export const calibration: Scorer = {
  id: "calibration",
  label: "Brier",
  higherIsBetter: false,
  score(resolved) {
    const done = resolved.filter((r) => r.outcome !== "pending");
    if (done.length === 0) {
      return { id: this.id, label: this.label, value: 0, detail: "n/a", higherIsBetter: false };
    }
    const sum = done.reduce((acc, r) => {
      const outcome = r.outcome === "hit" ? 1 : 0;
      const d = r.probability - outcome;
      return acc + d * d;
    }, 0);
    const value = sum / done.length;
    return {
      id: this.id,
      label: this.label,
      value,
      detail: value.toFixed(3),
      higherIsBetter: false,
    };
  },
};
