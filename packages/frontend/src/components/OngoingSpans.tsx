import { useState } from "react";
import { EVENT_META, isOngoingSpan, type PuppyEvent } from "@puppy-track/common";
import { useDeleteEvent, useUpdateEvent } from "@/hooks/useApi";
import { clockTime, timeAgo } from "@/lib/time";

function toLocalInput(ts: number): string {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function OngoingCard({ event }: { event: PuppyEvent }) {
  const meta = EVENT_META[event.type];
  const update = useUpdateEvent();
  const del = useDeleteEvent();
  const [editing, setEditing] = useState(false);
  const [endAt, setEndAt] = useState(toLocalInput(Date.now()));

  const endNow = () => update.mutate({ id: event.id, input: { endedAt: Date.now(), endUnknown: false } });
  const endUnknown = () => update.mutate({ id: event.id, input: { endedAt: null, endUnknown: true } });
  const cancel = () => del.mutate(event.id);
  const endAtTime = () => {
    update.mutate({ id: event.id, input: { endedAt: new Date(endAt).getTime(), endUnknown: false } });
    setEditing(false);
  };

  return (
    <div className="flex h-full flex-col justify-center rounded-field border border-brand/60 bg-brand-soft/60 p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="text-xl">{meta.emoji}</span>
          <span>
            <span className="block font-semibold">{meta.label} in progress</span>
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
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
              className="flex-1 rounded-field border border-line bg-surface px-2 py-1 text-sm"
            />
            <button className="btn-brand px-3 py-1 text-sm" onClick={endAtTime} disabled={update.isPending}>
              Save
            </button>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 px-2 py-1 text-sm" onClick={() => setEditing(false)}>
              Back
            </button>
            <button className="btn-ghost flex-1 px-2 py-1 text-sm" onClick={endUnknown} disabled={update.isPending}>
              Don't remember
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <button
            className="btn-brand w-full py-3 text-base"
            onClick={endNow}
            disabled={update.isPending}
          >
            End now
          </button>
          <div className="flex gap-2">
            <button className="btn-ghost flex-1 px-2 py-1 text-sm" onClick={() => setEditing(true)}>
              Already ended
            </button>
            <button
              className="btn-ghost flex-1 px-2 py-1 text-sm"
              onClick={cancel}
              disabled={del.isPending}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function OngoingSpans({ events }: { events: PuppyEvent[] }) {
  const ongoing = events
    .filter((e) => isOngoingSpan(e))
    .sort((a, b) => a.occurredAt - b.occurredAt);

  if (ongoing.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 [&>*]:flex-1">
      {ongoing.map((e) => (
        <OngoingCard key={e.id} event={e} />
      ))}
    </div>
  );
}
