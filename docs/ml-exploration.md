# Trend analyzer: statistical baseline and the ML path

This documents the v1 prediction engine and evaluates whether a machine-learning
model is worth adding, given the specific constraints of this app.

## The data we actually have

- **Low volume:** a few dozen events per day across six types (pee, poop, nap,
  playtime, meal, water).
- **Must be useful fast:** ideally within a few days of logging.
- **Non-stationary:** a puppy's routine changes week to week as she grows, so
  data from a month ago is a poor description of today.
- **Weak, noisy signal:** events are influenced by many unlogged factors
  (weather, visitors, a stolen sock). No model will be highly precise.

These three facts — little data, fast payoff, and drift — are exactly the
conditions under which heavy ML tends to underperform simple adaptive statistics.

## v1: the statistical baseline (shipped)

Implemented in [`packages/backend/src/analyzer/engine.ts`](../packages/backend/src/analyzer/engine.ts)
and [`scheduler.ts`](../packages/backend/src/analyzer/scheduler.ts). For each event type it combines:

1. **Recency-weighted interval model.** Weight every past event by
   `0.5 ^ (ageDays / halfLife)` (default half-life 4 days), then take the
   weighted mean and spread of inter-event intervals. Predict
   `lastEvent + meanInterval`. Confidence rises with consistency (low
   coefficient of variation) and with effective sample size.
2. **Time-of-day histogram.** A circular, recency-weighted 24-bin histogram
   nudges confidence up or down depending on whether the predicted time is a
   typical hour for that event.
3. **Trigger (cross-event) model.** Learns delays for relationships like
   meal → poop, water → pee, and nap-end → pee, and fires when a recent trigger
   hasn't yet been followed by its target.
4. **Feedback calibration.** Confirm/deny responses from the last 14 days scale
   each type's confidence, so repeated misses quietly suppress that prediction.

Why this fits: it produces a useful, *explainable* prediction from as few as 3–4
intervals, and the exponential weighting means it forgets stale habits
automatically. Every prediction ships with a human-readable `basis`.

## Where an ML model could help (and the trade-offs)

The honest answer: for the first several weeks, a well-tuned statistical model
is likely to match or beat ML. ML becomes interesting once there are weeks of
history and we want to capture interactions the hand-built triggers miss.

Candidate approaches, roughly in order of fit for this problem:

- **Exponentially-weighted Bayesian / Poisson rate models.** Treat each event
  type as a time-varying rate. A Bayesian update with a decay on the prior is
  essentially a principled version of the current interval model, and gives
  calibrated uncertainty for free. **Low data cost, handles drift well.** This
  is the most natural next step.
- **Survival / hazard (time-to-next-event) models.** Model the probability that
  the next event occurs by time *t* given covariates (time of day, time since
  meal, time since waking). Discrete-time hazard with a few features can be
  fit online and degrades gracefully with little data.
- **Hawkes (self-/mutually-exciting point) processes.** Purpose-built for events
  that trigger other events — a meal raising poop intensity, a nap-end raising
  pee intensity. This is the "right" generative model for the cross-event
  structure, at the cost of more care in fitting and regularization.
- **Gradient-boosted trees on engineered features.** Powerful and easy to apply,
  but data-hungry and prone to overfitting here, and it discards the temporal
  structure unless we hand-build it back as features. **Lowest fit for early,
  sparse, drifting data**; revisit only with a lot more history.

Deep sequence models (RNN/transformer) are not appropriate at this scale.

## Expected accuracy

With days-to-weeks of data, expect the model to be *directionally* useful — good
at "a pee is likely in the next 15–30 minutes" — not minute-precise. Potty
events after triggers (meal, waking) are the most predictable; spontaneous play
and water are the least. Treat predictions as gentle nudges, and lean on the
confirm/deny loop to keep them honest.

## Recommended path

1. Keep the statistical engine as the always-on baseline.
2. Add a `predicted vs. actual` accuracy log (we already persist predictions and
   their confirm/deny outcome) to measure calibration over time.
3. When there are ~3+ weeks of history, prototype the exponentially-weighted
   Bayesian rate model and the nap/meal Hawkes terms **offline** against that
   log, and only promote a model if it beats the baseline on logged accuracy.
4. Expose the chosen model behind the same `computeCandidates()` interface so the
   scheduler, notifications, and feedback loop are unchanged.
