// Estimates current fitness (VDOT) from logged runs, to steer the plan's paces.
import { effectiveHrMax } from "./analysis.ts";
import { addDays } from "./format.ts";
import type { Profile, Run, Workout } from "./types.ts";
import { vdotFromRace } from "./vdot.ts";

const vo2AtVelocity = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v in m/min
const vo2AtPace = (secPerKm: number) => vo2AtVelocity(60_000 / secPerKm);

export type FitnessSource = "race" | "tempo" | "hr";

export type FitnessEstimate = {
  /** Best evidence of a hard effort (race or race-like run, or threshold work). */
  strong?: { vdot: number; source: "race" | "tempo"; runs: number };
  /** Median estimate from easy runs with heart rate; noisy, so used only as a nudge. */
  hr?: { vdot: number; runs: number };
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Looks at runs from the last 6 weeks before `asOf`:
 * - races and runs rated "Bardzo ciężko" → VDOT from distance and time (a proven performance),
 * - tempo days with splits → the fastest third of kilometres is treated as threshold pace (~88% VDOT),
 * - easy runs with average HR → VO2 at that pace divided by the fraction of HR reserve / HR max.
 */
export function estimateFitness(
  profile: Profile,
  runs: Run[],
  workoutOn: (date: string) => Workout | undefined,
  asOf: string,
): FitnessEstimate {
  const from = addDays(asOf, -42);
  const recent = runs.filter((r) => r.date >= from && r.date <= asOf && r.km >= 2 && r.movingSec > 0);
  const out: FitnessEstimate = {};

  const raceVdots = recent
    .filter((r) => workoutOn(r.date)?.type === "race" || r.effort === 5)
    .map((r) => vdotFromRace(r.km, r.movingSec));

  const tempoVdots = recent
    .filter((r) => workoutOn(r.date)?.type === "tempo" && (r.splits?.length ?? 0) >= 3)
    .map((r) => {
      const fastest = [...r.splits!].sort((a, b) => a.paceSec - b.paceSec).slice(0, Math.ceil(r.splits!.length / 3));
      const pace = fastest.reduce((s, x) => s + x.paceSec, 0) / fastest.length;
      return vo2AtPace(pace) / 0.88;
    });

  if (raceVdots.length) out.strong = { vdot: Math.max(...raceVdots), source: "race", runs: raceVdots.length };
  else if (tempoVdots.length) out.strong = { vdot: median(tempoVdots), source: "tempo", runs: tempoVdots.length };

  const hrMax = effectiveHrMax(profile, runs).value;
  if (hrMax) {
    const hrVdots = recent
      .filter((r) => {
        const t = workoutOn(r.date)?.type;
        return r.avgHr && r.km >= 3 && (!t || t === "easy" || t === "long" || t === "strides");
      })
      .slice(0, 6)
      .flatMap((r) => {
        const vo2 = vo2AtPace(r.movingSec / r.km);
        if (profile.hrRest) {
          const f = (r.avgHr! - profile.hrRest) / (hrMax - profile.hrRest);
          return f >= 0.5 && f <= 0.97 ? [3.5 + (vo2 - 3.5) / f] : [];
        }
        // Swain: %VO2max ≈ (%HRmax − 37) / 0.64
        const f = ((r.avgHr! / hrMax) * 100 - 37) / 64;
        return f >= 0.5 && f <= 0.97 ? [vo2 / f] : [];
      });
    if (hrVdots.length >= 2) out.hr = { vdot: median(hrVdots), runs: hrVdots.length };
  }
  return out;
}

/** How far the plan's paces should move, in VDOT points, given the plan's expectation for now. */
export function fitnessAdjustment(est: FitnessEstimate, planned: number): { delta: number; source?: FitnessSource; runs: number } {
  let delta = 0;
  let source: FitnessSource | undefined;
  let runs = 0;
  if (est.strong) {
    const diff = est.strong.vdot - planned;
    // A good result counts fully; a weaker one only half (bad day, wind, hills).
    delta = diff > 0 ? diff : diff * 0.5;
    source = est.strong.source;
    runs = est.strong.runs;
  } else if (est.hr) {
    delta = (est.hr.vdot - planned) * 0.3;
    source = "hr";
    runs = est.hr.runs;
  }
  delta = Math.round(Math.max(-2, Math.min(3, delta)) * 10) / 10;
  return { delta, source, runs };
}
