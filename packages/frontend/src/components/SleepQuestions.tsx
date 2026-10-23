import { RESTLESSNESS_LEVELS } from "@puppy-track/common";
import { cn } from "@/lib/cn";

export interface SleepAnswers {
  peedInCage: boolean;
  poopedInCage: boolean;
  restlessness: number;
}

function YesNoToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-2">
        {[
          { v: false, l: "No" },
          { v: true, l: "Yes" },
        ].map((opt) => (
          <button
            key={opt.l}
            type="button"
            onClick={() => onChange(opt.v)}
            className={cn(
              "rounded-field border px-4 py-1.5 text-sm font-semibold",
              value === opt.v ? "border-brand bg-brand-soft" : "border-line bg-surface",
            )}
          >
            {opt.l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SleepQuestions({
  value,
  onChange,
}: {
  value: SleepAnswers;
  onChange: (value: SleepAnswers) => void;
}) {
  return (
    <div className="space-y-3">
      <YesNoToggle
        label="Pee in the cage?"
        value={value.peedInCage}
        onChange={(peedInCage) => onChange({ ...value, peedInCage })}
      />
      <YesNoToggle
        label="Poop in the cage?"
        value={value.poopedInCage}
        onChange={(poopedInCage) => onChange({ ...value, poopedInCage })}
      />
      <div>
        <span className="mb-1 block text-sm font-medium">How restless was she?</span>
        <div className="grid grid-cols-2 gap-2">
          {RESTLESSNESS_LEVELS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange({ ...value, restlessness: i })}
              className={cn(
                "rounded-field border px-3 py-2 text-sm font-medium",
                value.restlessness === i ? "border-brand bg-brand-soft" : "border-line bg-surface",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
