import type {
  Prediction,
  PredictionBasis,
  PredictionEventType,
  PredictionFactor,
  PredictionStatus,
  PuppyEvent,
  EventType,
} from "@puppy-track/common";

type EventRow = {
  id: string;
  type: string;
  userId: string | null;
  occurredAt: number;
  endedAt: number | null;
  endUnknown: boolean;
  amount: number | null;
  unit: string | null;
  notes: string | null;
  metadata: string | null;
  createdAt: number;
};

type PredictionRow = {
  id: string;
  eventType: string;
  modelId: string;
  windowStart: number;
  windowEnd: number;
  predictedAt: number;
  confidence: number;
  basis: string | null;
  context: string | null;
  factors: string | null;
  sourceEventId: string | null;
  status: string;
  actualEventId: string | null;
  notifiedAt: number | null;
  feedbackAt: number | null;
  createdAt: number;
};

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function serializeEvent(row: EventRow): PuppyEvent {
  return {
    id: row.id,
    type: row.type as EventType,
    userId: row.userId,
    occurredAt: row.occurredAt,
    endedAt: row.endedAt,
    endUnknown: row.endUnknown,
    amount: row.amount,
    unit: row.unit,
    notes: row.notes,
    metadata: parseJson<Record<string, unknown>>(row.metadata),
    createdAt: row.createdAt,
  };
}

export function serializePrediction(row: PredictionRow): Prediction {
  return {
    id: row.id,
    eventType: row.eventType as PredictionEventType,
    modelId: row.modelId,
    windowStart: row.windowStart,
    windowEnd: row.windowEnd,
    predictedAt: row.predictedAt,
    confidence: row.confidence,
    basis: parseJson<PredictionBasis>(row.basis),
    factors: parseJson<PredictionFactor[]>(row.factors),
    context: parseJson<Record<string, number>>(row.context),
    sourceEventId: row.sourceEventId,
    status: row.status as PredictionStatus,
    actualEventId: row.actualEventId,
    notifiedAt: row.notifiedAt,
    feedbackAt: row.feedbackAt,
    createdAt: row.createdAt,
  };
}
