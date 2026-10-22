import type { EventType, PredictionFactor, PredictionTarget } from "@puppy-track/common";

// A single logged event as seen by a model. Spans carry `endedAt`; amount-kind
// events (meal/water/energy) carry `amount`.
export interface EventRow {
  id: string;
  type: EventType;
  occurredAt: number;
  endedAt: number | null;
  amount: number | null;
}

// The immutable input every model receives for one prediction cycle: all events
// within the lookback window, sorted ascending by occurrence, plus `now`.
export interface EventSnapshot {
  events: EventRow[];
  now: number;
}

// One forecast produced by a model.
export interface ModelPrediction {
  target: PredictionTarget;
  predictedAt: number;
  windowStart: number;
  windowEnd: number;
  probability: number;
  summary: string;
  factors: PredictionFactor[];
  sourceEventId?: string;
  context?: Record<string, number>;
  evidence?: string;
}

// The plugin contract. A model reads the shared snapshot and returns forecasts.
// Models must be pure with respect to the snapshot (no shared mutable state);
// a model may additionally read its own stored prediction rows for learning.
export interface PredictionModel {
  id: string;
  label: string;
  version: number;
  predict(snap: EventSnapshot): ModelPrediction[];
}
