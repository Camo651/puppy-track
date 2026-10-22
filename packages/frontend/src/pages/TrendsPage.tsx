import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ACTIVITY_TYPES, EVENT_META, type EventType, type PuppyEvent } from "@puppy-track/common";
import { useEvents } from "@/hooks/useApi";

const DAY = 86_400_000;

function dailyCounts(events: PuppyEvent[], days = 14) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - (days - 1) * DAY;
  const buckets: Record<string, { label: string; pee: number; poop: number }> = {};
  for (let i = 0; i < days; i++) {
    const ts = start + i * DAY;
    const label = new Date(ts).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
    buckets[new Date(ts).toDateString()] = { label, pee: 0, poop: 0 };
  }
  for (const e of events) {
    if (e.occurredAt < start) continue;
    const key = new Date(e.occurredAt).toDateString();
    const b = buckets[key];
    if (!b) continue;
    if (e.type === "pee") b.pee += 1;
    if (e.type === "poop") b.poop += 1;
  }
  return Object.values(buckets);
}

function TypePicker({
  value,
  onChange,
}: {
  value: EventType;
  onChange: (type: EventType) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  const current = EVENT_META[value];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-field border border-line bg-surface px-2 py-1 text-sm"
      >
        <span>{current.emoji}</span>
        <span>{current.label}</span>
        <span className="text-muted">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-64 w-44 overflow-auto rounded-field border border-line bg-card py-1 shadow-lg">
          {ACTIVITY_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                setOpen(false);
              }}
              className={
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm " +
                (t === value ? "bg-brand-soft font-semibold" : "")
              }
            >
              <span>{EVENT_META[t].emoji}</span>
              <span>{EVENT_META[t].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function hourHistogram(events: PuppyEvent[], type: EventType) {
  const bins = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}`, count: 0 }));
  for (const e of events) {
    if (e.type !== type) continue;
    bins[new Date(e.occurredAt).getHours()].count += 1;
  }
  return bins;
}

export function TrendsPage() {
  const { data: events } = useEvents({ limit: 1000 });
  const [type, setType] = useState<EventType>("pee");

  const daily = useMemo(() => dailyCounts(events ?? []), [events]);
  const hours = useMemo(() => hourHistogram(events ?? [], type), [events, type]);

  if (!events || events.length === 0)
    return <p className="text-muted">Log a few events to start seeing trends.</p>;

  return (
    <div className="space-y-6">
      <section className="card p-4">
        <div className="mb-3 text-sm font-semibold text-muted">Potty breaks per day</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={daily}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" />
            <XAxis dataKey="label" fontSize={11} tickLine={false} />
            <YAxis allowDecimals={false} width={24} fontSize={11} tickLine={false} />
            <Tooltip />
            <Bar dataKey="pee" name="Pee" fill="rgb(var(--color-brand))" radius={[3, 3, 0, 0]} />
            <Bar dataKey="poop" name="Poop" fill="#9c6b3f" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-muted">Time of day</span>
          <TypePicker value={type} onChange={setType} />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={hours}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--color-line))" />
            <XAxis dataKey="hour" interval={2} fontSize={11} tickLine={false} />
            <YAxis allowDecimals={false} width={24} fontSize={11} tickLine={false} />
            <Tooltip />
            <Bar dataKey="count" name="Count" fill="rgb(var(--color-brand))" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-muted">Hour of day (0–23), last {Math.min(events.length, 1000)} events.</p>
      </section>
    </div>
  );
}
