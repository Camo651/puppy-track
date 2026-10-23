import { useState } from "react";
import {
  EVENT_META,
  eventDisplayMeta,
  isOngoingSpan,
  isSleep,
  type PuppyEvent,
  type SleepMetadata,
  type UpdateEventInput,
} from "@puppy-track/common";
import { useDeleteEvent, useUpdateEvent } from "@/hooks/useApi";
import { SleepQuestions, type SleepAnswers } from "@/components/SleepQuestions";
import { cn } from "@/lib/cn";

function toLocalInput(ts: number): string {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

type EndMode = "running" | "now" | "time" | "unknown";

const END_OPTIONS: { id: EndMode; label: string }[] = [
  { id: "now", label: "Just ended" },
  { id: "time", label: "At a time" },
  { id: "running", label: "Still going" },
  { id: "unknown", label: "Don't remember" },
];

function initialEndMode(event: PuppyEvent): EndMode {
  if (isOngoingSpan(event)) return "running";
  if (event.endUnknown) return "unknown";
  if (event.endedAt) return "time";
  return "time";
}

export function EditEventSheet({ event, onClose }: { event: PuppyEvent; onClose: () => void }) {
  const meta = EVENT_META[event.type];
  const display = eventDisplayMeta(event);
  const isSpan = meta.kind === "span";
  const sleep = isSleep(event);
  const update = useUpdateEvent();
  const del = useDeleteEvent();

  const [occurredAt, setOccurredAt] = useState(toLocalInput(event.occurredAt));
  const [endMode, setEndMode] = useState<EndMode>(initialEndMode(event));
  const [endAt, setEndAt] = useState(toLocalInput(event.endedAt ?? Date.now()));
  const [amount, setAmount] = useState(event.amount != null ? String(event.amount) : "");
  const [notes, setNotes] = useState(event.notes ?? "");
  const [sleepAnswers, setSleepAnswers] = useState<SleepAnswers>(() => {
    const m = (event.metadata ?? {}) as Partial<SleepMetadata>;
    return {
      peedInCage: Boolean(m?.peedInCage),
      poopedInCage: Boolean(m?.poopedInCage),
      restlessness: typeof m?.restlessness === "number" ? m.restlessness : 0,
    };
  });

  const save = async () => {
    const input: UpdateEventInput = { occurredAt: new Date(occurredAt).getTime() };

    if (sleep) {
      input.metadata = { sleep: true, ...sleepAnswers } satisfies SleepMetadata;
    }

    if (isSpan) {
      if (endMode === "now") {
        input.endedAt = Date.now();
        input.endUnknown = false;
      } else if (endMode === "time") {
        input.endedAt = new Date(endAt).getTime();
        input.endUnknown = false;
      } else if (endMode === "unknown") {
        input.endedAt = null;
        input.endUnknown = true;
      } else {
        input.endedAt = null;
        input.endUnknown = false;
      }
    }

    if (meta.kind === "amount") {
      input.amount = amount ? Number(amount) : null;
      input.unit = amount ? meta.defaultUnit : null;
    }

    input.notes = notes.trim() || null;

    await update.mutateAsync({ id: event.id, input });
    onClose();
  };

  const remove = async () => {
    await del.mutateAsync(event.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-card bg-card p-5 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2 text-lg font-bold">
          <span className="text-2xl">{display.emoji}</span> Edit {display.label.toLowerCase()}
        </div>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-muted">{isSpan ? "Started" : "When"}</span>
          <input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full rounded-field border border-line bg-surface px-3 py-2"
          />
        </label>

        {isSpan && (
          <div className="mb-3">
            <span className="mb-1 block text-sm text-muted">Ended</span>
            <div className="grid grid-cols-2 gap-2">
              {END_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setEndMode(opt.id)}
                  className={cn(
                    "rounded-field border px-3 py-2 text-sm font-medium",
                    endMode === opt.id ? "border-brand bg-brand-soft" : "border-line bg-surface",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {endMode === "time" && (
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="mt-2 w-full rounded-field border border-line bg-surface px-3 py-2 text-sm"
              />
            )}
            {endMode === "unknown" && (
              <p className="mt-2 text-xs text-muted">
                Only the start time is used for trend analysis.
              </p>
            )}
          </div>
        )}

        {meta.kind === "amount" && (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-muted">Amount ({meta.defaultUnit})</span>
            <input
              type="number"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 60"
              className="w-full rounded-field border border-line bg-surface px-3 py-2"
            />
          </label>
        )}

        {sleep && (
          <div className="mb-4">
            <span className="mb-2 block text-sm text-muted">The night</span>
            <SleepQuestions value={sleepAnswers} onChange={setSleepAnswers} />
          </div>
        )}

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-muted">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-field border border-line bg-surface px-3 py-2"
          />
        </label>

        <div className="flex gap-2">
          <button
            className="btn-ghost px-4 text-red-500"
            onClick={remove}
            disabled={del.isPending}
            aria-label="Delete event"
          >
            Delete
          </button>
          <button className="btn-ghost flex-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-brand flex-1" onClick={save} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
