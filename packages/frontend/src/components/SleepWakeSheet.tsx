import { useState } from "react";
import type { PuppyEvent } from "@puppy-track/common";
import { clockTime, timeAgo } from "@/lib/time";
import { SleepQuestions, type SleepAnswers } from "@/components/SleepQuestions";

function toLocalInput(ts: number): string {
  const d = new Date(ts - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export function SleepWakeSheet({
  event,
  onSubmit,
  onCancel,
}: {
  event: PuppyEvent;
  // Called with the chosen wake time and the night's answers. The caller ends
  // the sleep and records the answers.
  onSubmit: (result: SleepAnswers & { endedAt: number }) => void;
  onCancel: () => void;
}) {
  const [endAt, setEndAt] = useState(toLocalInput(Date.now()));
  const [answers, setAnswers] = useState<SleepAnswers>({
    peedInCage: false,
    poopedInCage: false,
    restlessness: 0,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-t-card bg-card p-5 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 text-lg font-bold">Good morning! How was the night?</div>
        <div className="mb-4 text-xs text-muted">
          Asleep since {clockTime(event.occurredAt)} · {timeAgo(event.occurredAt)}
        </div>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-muted">Woke up</span>
          <input
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            className="w-full rounded-field border border-line bg-surface px-3 py-2"
          />
        </label>

        <SleepQuestions value={answers} onChange={setAnswers} />

        <div className="mt-5 flex gap-2">
          <button className="btn-ghost flex-1" onClick={onCancel}>
            Not yet
          </button>
          <button
            className="btn-brand flex-1"
            onClick={() => onSubmit({ ...answers, endedAt: new Date(endAt).getTime() })}
          >
            End sleep
          </button>
        </div>
      </div>
    </div>
  );
}
