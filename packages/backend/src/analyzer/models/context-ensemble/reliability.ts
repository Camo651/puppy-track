import { and, db, eq, gte, inArray, predictions as predictionsTable } from "@puppy-track/db";
import type { PredictionFactor } from "@puppy-track/common";
import { config } from "../../../config";
import { DAY } from "./context";

export type FactorStats = Map<string, { hits: number; miss: number }>;

// Count hits (confirmed) and misses (denied/expired) per factor key across this
// model's own resolved predictions in the scoring window.
export function loadFactorStats(modelId: string, now = Date.now()): FactorStats {
  const since = now - config.analyzer.scoringWindowDays * DAY;
  const rows = db
    .select({ factors: predictionsTable.factors, status: predictionsTable.status })
    .from(predictionsTable)
    .where(
      and(
        eq(predictionsTable.modelId, modelId),
        gte(predictionsTable.createdAt, since),
        inArray(predictionsTable.status, ["confirmed", "denied", "expired"]),
      ),
    )
    .all();

  const stats: FactorStats = new Map();
  for (const r of rows) {
    if (!r.factors) continue;
    let parsed: PredictionFactor[];
    try {
      parsed = JSON.parse(r.factors) as PredictionFactor[];
    } catch {
      continue;
    }
    const hit = r.status === "confirmed";
    for (const f of parsed) {
      const s = stats.get(f.key) ?? { hits: 0, miss: 0 };
      if (hit) s.hits += 1;
      else s.miss += 1;
      stats.set(f.key, s);
    }
  }
  return stats;
}

// Reliability multiplier in (0, 1]. Neutral (1) with no evidence or a clean
// record; repeated misses drag it down. (hits + 1) / (hits + miss + 1).
export function factorReliability(stats: FactorStats, key: string): number {
  const s = stats.get(key);
  if (!s) return 1;
  return (s.hits + 1) / (s.hits + s.miss + 1);
}
