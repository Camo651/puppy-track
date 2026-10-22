import type { PredictionModel } from "./types";
import { heuristicV0 } from "./heuristic-v0";
import { contextEnsemble } from "./context-ensemble";
import { flow } from "./flow";

// Every prediction model the system runs in parallel. Adding a model is a new
// folder exporting a PredictionModel plus one entry here.
export const modelRegistry: PredictionModel[] = [heuristicV0, contextEnsemble, flow];

export const DEFAULT_CHAMPION = "context-ensemble";

export function getModel(id: string): PredictionModel | null {
  return modelRegistry.find((m) => m.id === id) ?? null;
}

export type { EventRow, EventSnapshot, ModelPrediction, PredictionModel } from "./types";
