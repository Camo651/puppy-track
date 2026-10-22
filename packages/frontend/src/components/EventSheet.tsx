import { useState } from "react";
import { EVENT_META, type CreateEventInput, type EventType } from "@puppy-track/common";
import { useCreateEvent } from "@/hooks/useApi";
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

export function EventSheet({
  type,
  past = false,
  onClose,
}: {
  type: EventType;
  past?: boolean;
  onClose: () => void;
}) {
  const meta = EVENT_META[type];
  const isSpan = meta.kind === "span";
  const create = useCreateEvent();

  const [occurredAt, setOccurredAt] = useState(
    toLocalInput(isSpan && past ? Date.now() - 60 * 60000 : Date.now()),
  );
  const [endMode, setEndMode] = useState<EndMode>("now");
  const [endAt, setEndAt] = useState(toLocalInput(Date.now()));
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  const title = isSpan ? `${past ? "Add past " : "Log "}${meta.label.toLowerCase()}` : `Log ${meta.label}`;

  const submit = async () => {
    const occurred = new Date(occurredAt).getTime();
    const input: CreateEventInput = { type, occurredAt: occurred };

    if (isSpan) {
      if (endMode === "now") input.endedAt = Date.now();
      else if (endMode === "time") input.endedAt = new Date(endAt).getTime();
      else if (endMode === "unknown") {
        input.endedAt = null;
        input.endUnknown = true;
      } else {
        input.endedAt = null;
        input.endUnknown = false;
      }
    }

    if (meta.kind === "amount" && amount) {
      input.amount = Number(amount);
      input.unit = meta.defaultUnit;
    }
    if (notes.trim()) input.notes = notes.trim();

    await create.mutateAsync(input);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-card bg-card p-5 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2 text-lg font-bold">
          <span className="text-2xl">{meta.emoji}</span> {title}
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
                    endMode === opt.id
                      ? "border-brand bg-brand-soft"
                      : "border-line bg-surface",
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
          <button className="btn-ghost flex-1" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-brand flex-1" onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
