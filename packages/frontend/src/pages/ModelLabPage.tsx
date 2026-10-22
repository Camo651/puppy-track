import { useState } from "react";
import {
  PREDICTION_TARGETS,
  TARGET_META,
  type ModelInfo,
  type ModelScoreMetric,
} from "@puppy-track/common";
import { useModels, useSetChampion } from "@/hooks/useApi";

function formatMetric(m: ModelScoreMetric): string {
  if (m.id === "precision" || m.id === "recall") return `${Math.round(m.value * 100)}%`;
  if (m.id === "leadTime") return m.detail ?? `${Math.round(m.value)} min`;
  return m.detail ?? m.value.toFixed(3);
}

function MetricRow({ metrics }: { metrics: ModelScoreMetric[] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {metrics.map((m) => (
        <div key={m.id} className="rounded-field bg-brand-soft p-2 text-center">
          <div className="text-[10px] uppercase tracking-wide text-muted">{m.label}</div>
          <div className="text-sm font-semibold">{formatMetric(m)}</div>
        </div>
      ))}
    </div>
  );
}

function ModelCard({ model }: { model: ModelInfo }) {
  const [open, setOpen] = useState(false);
  const setChampion = useSetChampion();
  const score = model.score;
  const targetsWithData = PREDICTION_TARGETS.filter((t) => score?.perTarget?.[t]);

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{model.label}</span>
            {model.isChampion && (
              <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">
                Champion
              </span>
            )}
          </div>
          <div className="text-xs text-muted">
            v{model.version} · {score?.sampleSize ?? 0} predictions scored
          </div>
        </div>
        <button
          className="btn-brand px-3 py-1 text-sm"
          disabled={model.isChampion || setChampion.isPending}
          onClick={() => setChampion.mutate(model.id)}
        >
          {model.isChampion ? "Active" : "Make champion"}
        </button>
      </div>

      {score && score.overall.length > 0 ? (
        <div className="mt-3">
          <MetricRow metrics={score.overall} />
          {targetsWithData.length > 0 && (
            <button
              className="mt-2 text-xs font-medium text-muted underline"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Hide" : "Show"} per-target breakdown
            </button>
          )}
          {open && (
            <div className="mt-2 space-y-2">
              {targetsWithData.map((t) => (
                <div key={t}>
                  <div className="mb-1 text-xs font-semibold">
                    {TARGET_META[t].emoji} {TARGET_META[t].label}
                  </div>
                  <MetricRow metrics={score.perTarget[t]} />
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted">No scored predictions yet.</p>
      )}
    </div>
  );
}

export function ModelLabPage() {
  const { data: models, isLoading } = useModels();

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (!models || models.length === 0) return <p className="text-muted">No models registered.</p>;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold">Model Lab</h1>
        <p className="text-sm text-muted">
          Prediction models run in parallel. The champion drives your alerts; the rest run in the
          background so you can compare them. Scores cover the recent window.
        </p>
      </div>
      {models.map((m) => (
        <ModelCard key={m.id} model={m} />
      ))}
    </div>
  );
}
