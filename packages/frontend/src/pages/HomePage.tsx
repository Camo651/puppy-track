import { useState } from "react";
import {
  DEFAULT_ENERGY,
  ENERGY_ASLEEP,
  EVENT_META,
  isOngoingSpan,
  type EventType,
  type PuppyEvent,
} from "@puppy-track/common";
import { useCreateEvent, useDeleteEvent, useEvents, useUpdateEvent } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { OngoingSpans } from "@/components/OngoingSpans";
import { NapBanner } from "@/components/NapBanner";
import { EnergySlider } from "@/components/EnergySlider";
import { EnergyPopup } from "@/components/EnergyPopup";
import { clockTime } from "@/lib/time";

const QUICK_TYPES: EventType[] = ["pee", "poop", "meal", "water"];
const SPAN_TYPES: EventType[] = ["nap", "playtime", "walk", "training"];

// A manual energy change made within this window of the last one overwrites it
// rather than adding a new entry, so slider misclicks don't clutter the data.
const ENERGY_DEBOUNCE_MS = 60_000;

function RecentBanner({ events }: { events: PuppyEvent[] }) {
  const recent = events.filter((e) => e.type !== "energy").slice(0, 2);
  return (
    <div className="card flex flex-col justify-center p-4">
      <div className="mb-2 text-sm font-semibold text-muted">Recent</div>
      {recent.length > 0 ? (
        <ul className="divide-y divide-line/60">
          {recent.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2">
                <span className="text-xl">{EVENT_META[e.type].emoji}</span>
                <span className="font-medium">{EVENT_META[e.type].label}</span>
                {e.amount != null && (
                  <span className="text-sm text-muted">
                    {e.amount}
                    {e.unit}
                  </span>
                )}
              </span>
              <span className="text-sm text-muted">{clockTime(e.occurredAt)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-sm text-muted">No events yet. Tap a button below to start.</p>
      )}
    </div>
  );
}

export function HomePage() {
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const del = useDeleteEvent();
  const { data: events } = useEvents({ limit: 200 });
  const [justDone, setJustDone] = useState<EventType | null>(null);
  // Pending nap wake: holds the chosen end time until an energy level is picked.
  const [wakeAt, setWakeAt] = useState<number | null>(null);

  const list = events ?? [];
  const activeSpan = list.find((e) => isOngoingSpan(e)) ?? null;
  const activeNap = activeSpan && activeSpan.type === "nap" ? activeSpan : null;
  const lastEnergy = list.find((e) => e.type === "energy");
  const energyLevel = activeNap ? ENERGY_ASLEEP : (lastEnergy?.amount ?? DEFAULT_ENERGY);

  const flash = (type: EventType) => {
    setJustDone(type);
    window.setTimeout(() => setJustDone((t) => (t === type ? null : t)), 1200);
  };

  // When debouncing, overwrite the most recent energy entry if it was written
  // within the last minute; otherwise add a fresh one. Nap markers and wake
  // readings opt out so they always stand as their own entries.
  const logEnergy = (level: number, opts?: { debounce?: boolean }) => {
    const debounce = opts?.debounce ?? true;
    if (debounce && lastEnergy && Date.now() - lastEnergy.createdAt < ENERGY_DEBOUNCE_MS) {
      return update.mutateAsync({
        id: lastEnergy.id,
        input: { amount: level, occurredAt: Date.now() },
      });
    }
    return create.mutateAsync({ type: "energy", amount: level });
  };

  const quickAdd = async (type: EventType) => {
    await create.mutateAsync({ type });
    flash(type);
  };

  const startSpan = async (type: EventType) => {
    if (activeSpan) return;
    await create.mutateAsync({ type, endedAt: null, endUnknown: false });
    // Starting a nap means the puppy is now asleep.
    if (type === "nap") await logEnergy(ENERGY_ASLEEP, { debounce: false });
    flash(type);
  };

  // Energy slider coupling with naps.
  const commitEnergy = async (level: number) => {
    if (level === ENERGY_ASLEEP) {
      if (activeNap) return; // already asleep
      if (activeSpan) {
        await logEnergy(level); // another span is running; can't also nap
        return;
      }
      await create.mutateAsync({ type: "nap", endedAt: null, endUnknown: false });
      await logEnergy(level, { debounce: false });
      return;
    }
    if (activeNap) {
      // Waking via the slider: the new level is already chosen, so end now.
      await update.mutateAsync({
        id: activeNap.id,
        input: { endedAt: Date.now(), endUnknown: false },
      });
      await logEnergy(level, { debounce: false });
      return;
    }
    await logEnergy(level);
  };

  // Cancel a nap as if it never started: discard the span and remove the
  // "Asleep" marker logged at nap start so energy reverts to its prior value.
  const cancelNap = async () => {
    if (!activeNap) return;
    if (lastEnergy && lastEnergy.amount === ENERGY_ASLEEP) {
      await del.mutateAsync(lastEnergy.id);
    }
    await del.mutateAsync(activeNap.id);
  };

  // Nap wake via the banner: end at the chosen time only after the energy popup.
  const confirmWake = async (level: number) => {
    if (!activeNap || wakeAt === null) return;
    await update.mutateAsync({
      id: activeNap.id,
      input: { endedAt: wakeAt, endUnknown: false },
    });
    await logEnergy(level, { debounce: false });
    setWakeAt(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-[8.5rem] flex-col [&>*]:flex-1">
        {activeNap ? (
          <NapBanner
            event={activeNap}
            onWake={(endedAt) => setWakeAt(endedAt)}
            onCancel={cancelNap}
          />
        ) : activeSpan ? (
          <OngoingSpans events={list} />
        ) : (
          <RecentBanner events={list} />
        )}
      </div>

      <div className="min-h-4 flex-1" />

      <div className="mt-4 grid grid-cols-4 gap-2">
        {QUICK_TYPES.map((type) => {
          const meta = EVENT_META[type];
          return (
            <button
              key={type}
              onClick={() => quickAdd(type)}
              className={cn(
                "card flex flex-col items-center gap-1 py-4 active:scale-95",
                justDone === type && "ring-2 ring-brand",
              )}
            >
              <span className="text-3xl">{meta.emoji}</span>
              <span className="text-xs font-semibold">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        <EnergySlider level={energyLevel} onCommit={commitEnergy} />
      </div>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {SPAN_TYPES.map((type) => {
          const meta = EVENT_META[type];
          const disabled = Boolean(activeSpan);
          return (
            <button
              key={type}
              onClick={() => startSpan(type)}
              disabled={disabled}
              className={cn(
                "card flex flex-col items-center gap-1 py-4 active:scale-95",
                justDone === type && "ring-2 ring-brand",
                disabled && "pointer-events-none opacity-40",
              )}
            >
              <span className="text-3xl">{meta.emoji}</span>
              <span className="text-xs font-semibold">Start {meta.label.toLowerCase()}</span>
            </button>
          );
        })}
      </div>

      {wakeAt !== null && (
        <EnergyPopup
          title="They're awake — how's their energy?"
          onSelect={confirmWake}
          onCancel={() => setWakeAt(null)}
        />
      )}
    </div>
  );
}
