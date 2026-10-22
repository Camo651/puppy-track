import { useEffect, useRef, useState } from "react";
import { ENERGY_MAX, ENERGY_MIN, energyLabel } from "@puppy-track/common";

export function EnergySlider({
  level,
  onCommit,
}: {
  level: number;
  onCommit: (level: number) => void;
}) {
  const [value, setValue] = useState(level);
  const dragging = useRef(false);
  const lastCommitted = useRef(level);

  useEffect(() => {
    if (!dragging.current) {
      setValue(level);
      lastCommitted.current = level;
    }
  }, [level]);

  const commit = () => {
    dragging.current = false;
    // Guard against duplicate pointerup/touchend firing on touch devices.
    if (value === lastCommitted.current) return;
    lastCommitted.current = value;
    onCommit(value);
  };

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-muted">Energy</span>
        <span className="text-sm font-semibold">{energyLabel(value)}</span>
      </div>
      <div className="energy-ramp">
        <div className="energy-ramp__fill" />
        <input
          type="range"
          min={ENERGY_MIN}
          max={ENERGY_MAX}
          step={0.1}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          onPointerDown={() => {
            dragging.current = true;
          }}
          onPointerUp={commit}
          onTouchEnd={commit}
          onKeyUp={commit}
          onBlur={commit}
          className="energy-ramp__input"
          aria-label="Energy level"
        />
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>Asleep</span>
        <span>Extremely hyper</span>
      </div>
    </div>
  );
}
