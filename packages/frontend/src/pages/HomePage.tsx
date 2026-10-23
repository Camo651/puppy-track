import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_ENERGY,
  ENERGY_ASLEEP,
  EVENT_META,
  eventDisplayMeta,
  isOngoingSpan,
  isSleep,
  type EventType,
  type PuppyEvent,
  type SleepMetadata,
} from "@puppy-track/common";
import { useCreateEvent, useDeleteEvent, useEvents, useUpdateEvent } from "@/hooks/useApi";
import { cn } from "@/lib/cn";
import { OngoingSpans } from "@/components/OngoingSpans";
import { NapBanner } from "@/components/NapBanner";
import { SleepBanner } from "@/components/SleepBanner";
import { SleepWakeSheet } from "@/components/SleepWakeSheet";
import { type SleepAnswers } from "@/components/SleepQuestions";
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
          {recent.map((e) => {
            const meta = eventDisplayMeta(e);
            return (
            <li key={e.id} className="flex items-center justify-between py-2">
              <span className="flex items-center gap-2">
                <span className="text-xl">{meta.emoji}</span>
                <span className="font-medium">{meta.label}</span>
                {e.amount != null && (
                  <span className="text-sm text-muted">
                    {e.amount}
                    {e.unit}
                  </span>
                )}
              </span>
              <span className="text-sm text-muted">{clockTime(e.occurredAt)}</span>
            </li>
            );
          })}
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
  // Morning sleep check-in: whether its sheet is open, and the submitted answers
  // held until an energy level is picked (mirroring the nap wake flow).
  const [sleepWakeOpen, setSleepWakeOpen] = useState(false);
  const [pendingSleep, setPendingSleep] = useState<(SleepAnswers & { endedAt: number }) | null>(
    null,
  );

  const list = events ?? [];
  const activeSpan = list.find((e) => isOngoingSpan(e)) ?? null;
  const activeNap = activeSpan && activeSpan.type === "nap" ? activeSpan : null;
  const activeSleep = activeNap && isSleep(activeNap) ? activeNap : null;
  const lastEnergy = list.find((e) => e.type === "energy");
  const energyLevel = activeNap ? ENERGY_ASLEEP : (lastEnergy?.amount ?? DEFAULT_ENERGY);

  // When the app opens with sleep mode already on, the first thing to do is end
  // it and answer the morning questions. Only auto-prompt on the first data load
  // so starting sleep (before bed) doesn't immediately ask about the night.
  const promptedForWake = useRef(false);
  useEffect(() => {
    if (!events || promptedForWake.current) return;
    promptedForWake.current = true;
    if (activeSleep) setSleepWakeOpen(true);
  }, [events, activeSleep]);

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

  // Sleep mode is an overnight nap, flagged so the morning check-in appears and
  // history can tell it apart from a daytime nap.
  const startSleep = async () => {
    if (activeSpan) return;
    const metadata: SleepMetadata = { sleep: true };
    await create.mutateAsync({ type: "nap", endedAt: null, endUnknown: false, metadata });
    await logEnergy(ENERGY_ASLEEP, { debounce: false });
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

  // Morning sleep wake: record the night's answers, end the sleep at the chosen
  // time, and log the waking energy level.
  const confirmSleepWake = async (level: number) => {
    if (!activeSleep || !pendingSleep) return;
    const metadata: SleepMetadata = {
      ...(activeSleep.metadata as Partial<SleepMetadata>),
      sleep: true,
      peedInCage: pendingSleep.peedInCage,
      poopedInCage: pendingSleep.poopedInCage,
      restlessness: pendingSleep.restlessness,
    };
    await update.mutateAsync({
      id: activeSleep.id,
      input: { endedAt: pendingSleep.endedAt, endUnknown: false, metadata },
    });
    await logEnergy(level, { debounce: false });
    setPendingSleep(null);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-[8.5rem] flex-col [&>*]:flex-1">
        {activeSleep ? (
          <SleepBanner
            event={activeSleep}
            onWake={() => setSleepWakeOpen(true)}
            onCancel={cancelNap}
          />
        ) : activeNap ? (
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

      <button
        onClick={startSleep}
        disabled={Boolean(activeSpan)}
        className={cn(
          "card mt-2 flex w-full items-center justify-center gap-2 py-4 active:scale-95",
          Boolean(activeSpan) && "pointer-events-none opacity-40",
        )}
      >
        <span className="text-3xl">🌙</span>
        <span className="text-sm font-semibold">Start sleep mode</span>
      </button>

      {wakeAt !== null && (
        <EnergyPopup
          title="They're awake — how's their energy?"
          onSelect={confirmWake}
          onCancel={() => setWakeAt(null)}
        />
      )}

      {sleepWakeOpen && activeSleep && (
        <SleepWakeSheet
          event={activeSleep}
          onSubmit={(result) => {
            setPendingSleep(result);
            setSleepWakeOpen(false);
          }}
          onCancel={() => setSleepWakeOpen(false)}
        />
      )}

      {pendingSleep !== null && (
        <EnergyPopup
          title="Good morning — how's her energy now?"
          onSelect={confirmSleepWake}
          onCancel={() => setPendingSleep(null)}
        />
      )}
    </div>
  );
}
