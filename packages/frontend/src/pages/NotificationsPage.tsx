import { EVENT_META, TARGET_META, type Prediction } from "@puppy-track/common";
import { usePredictionFeedback, usePredictions } from "@/hooks/useApi";
import { clockTime, timeAgo, timeUntil } from "@/lib/time";

const STATUS_LABEL: Record<Prediction["status"], string> = {
  pending: "Pending",
  notified: "Predicted",
  confirmed: "Happened ✓",
  denied: "Didn't happen",
  expired: "Expired",
};

function targetMeta(type: Prediction["eventType"]): { label: string; emoji: string } {
  const target = (TARGET_META as Record<string, { label: string; emoji: string }>)[type];
  if (target) return target;
  const event = (EVENT_META as Record<string, { label: string; emoji: string }>)[type];
  if (event) return event;
  return { label: type, emoji: "🔔" };
}

export function NotificationsPage() {
  const { data: predictions, isLoading } = usePredictions(80);
  const feedback = usePredictionFeedback();

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!predictions || predictions.length === 0)
    return (
      <p className="text-muted">
        No predictions yet. Once the analyzer learns {`${""}`}your puppy's routine, predicted events
        will show up here.
      </p>
    );

  return (
    <div className="space-y-3">
      {predictions.map((p) => {
        const meta = targetMeta(p.eventType);
        const factors = p.basis?.factors ?? p.factors ?? [];
        const awaiting = p.status === "notified" || p.status === "pending";
        return (
          <div key={p.id} className="card p-4">
            <div className="flex items-start justify-between">
              <span className="flex items-center gap-2">
                <span className="text-2xl">{meta.emoji}</span>
                <span>
                  <span className="block font-semibold">{meta.label}</span>
                  <span className="block text-xs text-muted">
                    {p.predictedAt > Date.now()
                      ? `expected ${timeUntil(p.predictedAt)}`
                      : `expected around ${clockTime(p.predictedAt)}`}
                  </span>
                </span>
              </span>
              <span className="text-right">
                <span className="block text-xs font-semibold text-muted">
                  {STATUS_LABEL[p.status]}
                </span>
                <span className="block text-xs text-muted">{Math.round(p.confidence * 100)}%</span>
              </span>
            </div>

            {p.basis?.summary && <p className="mt-2 text-sm text-muted">{p.basis.summary}</p>}

            {factors.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {factors.map((f) => (
                  <span
                    key={f.key}
                    className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-ink"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            )}

            {p.basis?.evidence && (
              <p className="mt-1 text-[11px] text-muted">{p.basis.evidence}</p>
            )}

            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted">{timeAgo(p.createdAt)}</span>
              {awaiting && (
                <span className="flex gap-2">
                  <button
                    className="btn-ghost px-3 py-1 text-sm"
                    disabled={feedback.isPending}
                    onClick={() => feedback.mutate({ id: p.id, happened: false })}
                  >
                    Nope
                  </button>
                  <button
                    className="btn-brand px-3 py-1 text-sm"
                    disabled={feedback.isPending}
                    onClick={() => feedback.mutate({ id: p.id, happened: true })}
                  >
                    It happened
                  </button>
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
