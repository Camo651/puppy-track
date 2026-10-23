import { z } from "zod";

export const EVENT_TYPES = [
  "pee",
  "poop",
  "nap",
  "playtime",
  "walk",
  "training",
  "meal",
  "water",
  "energy",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export type EventKind = "instant" | "span" | "amount";

export const EVENT_META: Record<
  EventType,
  { label: string; emoji: string; kind: EventKind; defaultUnit?: string }
> = {
  pee: { label: "Pee", emoji: "💦", kind: "instant" },
  poop: { label: "Poop", emoji: "💩", kind: "instant" },
  nap: { label: "Nap", emoji: "💤", kind: "span" },
  playtime: { label: "Playtime", emoji: "🎾", kind: "span" },
  walk: { label: "Walk", emoji: "🦮", kind: "span" },
  training: { label: "Training", emoji: "🎓", kind: "span" },
  meal: { label: "Meal", emoji: "🍖", kind: "amount", defaultUnit: "g" },
  water: { label: "Water", emoji: "🚰", kind: "amount", defaultUnit: "ml" },
  energy: { label: "Energy", emoji: "⚡", kind: "amount" },
};

export const isSpanType = (type: EventType): boolean => EVENT_META[type].kind === "span";

// Activity types are everything the user logs directly; `energy` is a background
// metric captured by the slider, so it is excluded from activity lists/history.
export const ACTIVITY_TYPES: EventType[] = EVENT_TYPES.filter((t) => t !== "energy");

// Energy levels, low (asleep) to high. The slider stores the index as amount.
export const ENERGY_LEVELS = ["Asleep", "Sleepy", "Calm", "Playful", "Hyper", "Extremely hyper"] as const;
export const ENERGY_MIN = 0;
export const ENERGY_MAX = ENERGY_LEVELS.length - 1;
export const ENERGY_ASLEEP = 0;
export const DEFAULT_ENERGY = 3;

export function energyLabel(level: number): string {
  const i = Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, Math.round(level)));
  return ENERGY_LEVELS[i];
}

// Things the prediction models forecast. Energy highs/lows are derived from the
// energy slider rather than logged directly, so they are targets but not event
// types. Stored in the predictions table's event_type column as plain strings.
export const PREDICTION_TARGETS = ["pee", "poop", "nap", "energy_high", "energy_low"] as const;
export type PredictionTarget = (typeof PREDICTION_TARGETS)[number];

export const TARGET_META: Record<
  PredictionTarget,
  { label: string; emoji: string; verb: string }
> = {
  pee: { label: "Pee", emoji: "💦", verb: "might need to pee" },
  poop: { label: "Poop", emoji: "💩", verb: "might need to poop" },
  nap: { label: "Nap", emoji: "💤", verb: "might be getting sleepy" },
  energy_high: { label: "Zoomies", emoji: "⚡", verb: "might be getting zoomies" },
  energy_low: { label: "Winding down", emoji: "🥱", verb: "might be winding down" },
};

// The event_type column on predictions holds either a real event type or a
// derived energy target.
export type PredictionEventType = EventType | "energy_high" | "energy_low";

export const PREDICTION_STATUSES = [
  "pending",
  "notified",
  "confirmed",
  "denied",
  "expired",
] as const;
export type PredictionStatus = (typeof PREDICTION_STATUSES)[number];

export interface User {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

export interface PuppyProfile {
  name: string | null;
  birthdate: number | null;
}

export interface PuppyEvent {
  id: string;
  type: EventType;
  userId: string | null;
  occurredAt: number;
  endedAt: number | null;
  // Span is complete but its end time was not recorded. endedAt stays null and
  // analysis treats the span as a single point at occurredAt.
  endUnknown: boolean;
  amount: number | null;
  unit: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

// A span (nap/playtime/walk) that has started but not ended and is not marked
// end-unknown, i.e. it is currently in progress.
export function isOngoingSpan(e: Pick<PuppyEvent, "type" | "endedAt" | "endUnknown">): boolean {
  return isSpanType(e.type) && e.endedAt === null && !e.endUnknown;
}

// Overnight sleep is stored as a `nap` event flagged with `sleep: true` in its
// metadata, so it reuses all nap-based analysis, prediction, and history. The
// remaining fields capture the morning check-in answers.
export interface SleepMetadata extends Record<string, unknown> {
  sleep: true;
  peedInCage?: boolean;
  poopedInCage?: boolean;
  restlessness?: number;
}

export function isSleep(e: Pick<PuppyEvent, "type" | "metadata">): boolean {
  return e.type === "nap" && Boolean((e.metadata as { sleep?: unknown } | null)?.sleep);
}

export const SLEEP_META = { label: "Sleep", emoji: "🌙" } as const;

// Display label/emoji for an event, distinguishing overnight sleep from a nap
// even though both share the `nap` event type.
export function eventDisplayMeta(
  e: Pick<PuppyEvent, "type" | "metadata">,
): { label: string; emoji: string } {
  if (isSleep(e)) return { label: SLEEP_META.label, emoji: SLEEP_META.emoji };
  const meta = EVENT_META[e.type];
  return { label: meta.label, emoji: meta.emoji };
}

// How restless the puppy was overnight, calm to disruptive. Stored as the index
// in sleep metadata's `restlessness` field.
export const RESTLESSNESS_LEVELS = [
  "Slept soundly",
  "A little restless",
  "Restless",
  "Very restless",
] as const;

export function restlessnessLabel(level: number): string {
  const i = Math.max(0, Math.min(RESTLESSNESS_LEVELS.length - 1, Math.round(level)));
  return RESTLESSNESS_LEVELS[i];
}

// A one-line summary of the morning check-in, or null if there is nothing to show.
export function sleepSummary(e: Pick<PuppyEvent, "type" | "metadata">): string | null {
  if (!isSleep(e)) return null;
  const m = (e.metadata ?? {}) as Partial<SleepMetadata>;
  const parts: string[] = [];
  if (m.peedInCage) parts.push("Peed in cage");
  if (m.poopedInCage) parts.push("Pooped in cage");
  if (typeof m.restlessness === "number") parts.push(restlessnessLabel(m.restlessness));
  return parts.length ? parts.join(" · ") : null;
}

export interface PredictionFactor {
  key: string;
  label: string;
  weight: number;
}

export interface PredictionBasis {
  summary: string;
  signals: string[];
  factors?: PredictionFactor[];
  evidence?: string;
}

export interface Prediction {
  id: string;
  eventType: PredictionEventType;
  modelId: string;
  windowStart: number;
  windowEnd: number;
  predictedAt: number;
  confidence: number;
  basis: PredictionBasis | null;
  factors: PredictionFactor[] | null;
  context: Record<string, number> | null;
  sourceEventId: string | null;
  status: PredictionStatus;
  actualEventId: string | null;
  notifiedAt: number | null;
  feedbackAt: number | null;
  createdAt: number;
}

export interface ModelScoreMetric {
  id: string;
  label: string;
  value: number;
  detail?: string;
  higherIsBetter: boolean;
}

export interface ModelScore {
  modelId: string;
  perTarget: Record<string, ModelScoreMetric[]>;
  overall: ModelScoreMetric[];
  sampleSize: number;
}

export interface ModelInfo {
  id: string;
  label: string;
  version: number;
  isChampion: boolean;
  score: ModelScore | null;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export const createEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  occurredAt: z.number().int().optional(),
  endedAt: z.number().int().nullable().optional(),
  endUnknown: z.boolean().optional(),
  amount: z.number().nullable().optional(),
  unit: z.string().max(16).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventSchema.partial().omit({ type: true }).extend({
  type: z.enum(EVENT_TYPES).optional(),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

export const predictionFeedbackSchema = z.object({
  happened: z.boolean(),
});

export const setChampionSchema = z.object({
  modelId: z.string().min(1).max(64),
});
export type SetChampionInput = z.infer<typeof setChampionSchema>;
