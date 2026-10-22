import type { Scorer } from "./types";
import { precision } from "./scorers/precision";
import { recall } from "./scorers/recall";
import { leadTime } from "./scorers/lead-time";
import { calibration } from "./scorers/calibration";

// Every scorer applied to each model. Adding a scorer is a new file implementing
// Scorer plus one entry here.
export const scorerRegistry: Scorer[] = [precision, recall, leadTime, calibration];

export type { Scorer, ResolvedPrediction, RealTargetEvent } from "./types";
