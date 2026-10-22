import { ENERGY_ASLEEP, ENERGY_LEVELS } from "@puppy-track/common";

export function EnergyPopup({
  title = "How's their energy now?",
  onSelect,
  onCancel,
}: {
  title?: string;
  onSelect: (level: number) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onCancel}>
      <div
        className="w-full max-w-md rounded-t-card bg-card p-5 safe-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 text-lg font-bold">{title}</div>
        <div className="space-y-2">
          {ENERGY_LEVELS.map((label, i) =>
            i === ENERGY_ASLEEP ? null : (
              <button
                key={i}
                className="btn-ghost w-full justify-start"
                onClick={() => onSelect(i)}
              >
                {label}
              </button>
            ),
          )}
        </div>
        <button className="btn-ghost mt-3 w-full" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
