import { useState } from "react";
import { EVENT_META, type PuppyEvent } from "@puppy-track/common";
import { clockTime, timeAgo } from "@/lib/time";

function toLocalInput(ts: number): string {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function NapBanner({
  event,
  onWake,
  onCancel,
}: {
  event: PuppyEvent;
  // Called with the chosen end time; the parent then asks for the new energy
  // level before the nap actually ends.
  onWake: (endedAt: number) => void;
  // Discards the nap entirely and restores the energy level from before it started.
  onCancel: () => void;
}) {
  const meta = EVENT_META.nap;
  const [editing, setEditing] = useState(false);
  const [endAt, setEndAt] = useState(toLocalInput(Date.now()));

  return (
    <div className="flex flex-col justify-center rounded-field border border-brand/60 bg-brand-soft/60 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="text-xl">{meta.emoji}</span>
          <span>
            <span className="block font-semibold">Nap in progress</span>
            <span className="block text-xs text-muted">
              started {clockTime(event.occurredAt)} · {timeAgo(event.occurredAt)}
            </span>
          </span>
        </span>
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
        </span>
      </div>

      {editing ? (
        <div className="mt-3 space-y-2">
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full rounded-field border border-line bg-surface px-2 py-1 text-sm"
          />
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 px-2 py-1 text-sm" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="btn-brand flex-1 px-2 py-1 text-sm"
              onClick={() => onWake(new Date(endAt).getTime())}
            >
              Wake up
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <button className="btn-brand flex-1 px-2 py-1 text-sm" onClick={() => onWake(Date.now())}>
              Wake up
            </button>
            <button className="btn-ghost flex-1 px-2 py-1 text-sm" onClick={() => setEditing(true)}>
              Set wake time…
            </button>
          </div>
          <button className="btn-ghost w-full px-2 py-1 text-sm" onClick={onCancel}>
            Cancel nap
          </button>
        </div>
      )}
    </div>
  );
}
