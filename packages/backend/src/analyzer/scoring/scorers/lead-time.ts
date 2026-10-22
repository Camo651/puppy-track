import type { Scorer } from "../types";

// Mean minutes of warning on hits: how early the prediction existed before the
// real event occurred.
export const leadTime: Scorer = {
  id: "leadTime",
  label: "Lead time",
  higherIsBetter: true,
  score(resolved) {
    const hits = resolved.filter((r) => r.outcome === "hit" && r.actualAt != null);
    if (hits.length === 0) {
      return { id: this.id, label: this.label, value: 0, detail: "no hits", higherIsBetter: true };
    }
    const mins = hits.map((r) => Math.max(0, (r.actualAt! - r.createdAt) / 60_000));
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length;
    return {
      id: this.id,
      label: this.label,
      value: avg,
      detail: `${avg.toFixed(0)} min`,
      higherIsBetter: true,
    };
  },
};
