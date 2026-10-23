import { SLEEP_META, type PuppyEvent } from "@puppy-track/common";
import { clockTime, timeAgo } from "@/lib/time";

export function SleepBanner({
  event,
  onWake,
  onCancel,
}: {
  event: PuppyEvent;
  // Opens the morning check-in, which ends the sleep once answered.
  onWake: () => void;
  // Discards the sleep entirely and restores the energy level from before it started.
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col justify-center rounded-field border border-brand/60 bg-brand-soft/60 p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="text-xl">{SLEEP_META.emoji}</span>
          <span>
            <span className="block font-semibold">Sleep mode on</span>
            <span className="block text-xs text-muted">
              since {clockTime(event.occurredAt)} · {timeAgo(event.occurredAt)}
            </span>
          </span>
        </span>
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button className="btn-brand w-full py-3 text-base" onClick={onWake}>
          Good morning ☀️
        </button>
        <button className="btn-ghost w-full px-2 py-1 text-sm" onClick={onCancel}>
          Cancel sleep
        </button>
      </div>
    </div>
  );
}
