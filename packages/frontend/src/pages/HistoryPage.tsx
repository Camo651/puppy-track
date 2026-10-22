import { useMemo, useState } from "react";
import { EVENT_META, isOngoingSpan, isSpanType, type PuppyEvent } from "@puppy-track/common";
import { useEvents } from "@/hooks/useApi";
import { EditEventSheet } from "@/components/EditEventSheet";
import { clockTime, dayLabel } from "@/lib/time";

function spanDetail(e: PuppyEvent): string | null {
  if (!isSpanType(e.type)) return null;
  if (isOngoingSpan(e)) return "ongoing";
  if (e.endUnknown) return "end not remembered";
  if (e.endedAt) return `${Math.round((e.endedAt - e.occurredAt) / 60000)}m`;
  return null;
}

function groupByDay(events: PuppyEvent[]): { day: string; items: PuppyEvent[] }[] {
  const groups: Record<string, PuppyEvent[]> = {};
  for (const e of events) {
    const key = new Date(e.occurredAt).toDateString();
    (groups[key] ??= []).push(e);
  }
  return Object.entries(groups).map(([key, items]) => ({
    day: dayLabel(new Date(key).getTime()),
    items,
  }));
}

export function HistoryPage() {
  const { data: events, isLoading } = useEvents({ limit: 500 });
  const [editing, setEditing] = useState<PuppyEvent | null>(null);
  const visible = useMemo(() => (events ?? []).filter((e) => e.type !== "energy"), [events]);
  const groups = useMemo(() => groupByDay(visible), [visible]);

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (visible.length === 0) return <p className="text-muted">No events logged yet.</p>;

  return (
    <>
      <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.day}>
          <div className="mb-2 text-sm font-semibold text-muted">{group.day}</div>
          <ul className="card divide-y divide-line/60">
            {group.items.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setEditing(e)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left active:bg-brand-soft/40"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-xl">{EVENT_META[e.type].emoji}</span>
                    <span>
                      <span className="block font-medium">{EVENT_META[e.type].label}</span>
                      {e.notes && <span className="block text-xs text-muted">{e.notes}</span>}
                    </span>
                    {e.amount != null && (
                      <span className="text-sm text-muted">
                        {e.amount}
                        {e.unit}
                      </span>
                    )}
                    {spanDetail(e) && (
                      <span
                        className={
                          isOngoingSpan(e)
                            ? "rounded-full bg-brand-soft px-2 py-0.5 text-xs font-semibold"
                            : "text-sm text-muted"
                        }
                      >
                        {spanDetail(e)}
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted">
                    {clockTime(e.occurredAt)}
                    <span aria-hidden>›</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      </div>
      {editing && <EditEventSheet event={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
