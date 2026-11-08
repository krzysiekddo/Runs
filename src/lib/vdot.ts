// Jack Daniels' VDOT model (Daniels & Gilbert oxygen-cost and drop-dead formulas).
import type { PaceRange } from "./types.ts";

const vo2AtVelocity = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v; // v in m/min
const fractionSustained = (min: number) =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * min) + 0.2989558 * Math.exp(-0.1932605 * min);

export function vdotFromRace(km: number, sec: number): number {
  const min = sec / 60;
  return vo2AtVelocity((km * 1000) / min) / fractionSustained(min);
}

/** Pace (s/km) at which the runner works at the given fraction of VDOT. */
function paceAt(fraction: number, vdot: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(fraction * vdot + 4.6);
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  return 60_000 / v;
}

export type TrainingPaces = {
  easy: PaceRange;
  marathon: PaceRange;
  threshold: PaceRange;
  interval: PaceRange;
  repetition: PaceRange;
};

export function trainingPaces(vdot: number): TrainingPaces {
  const around = (f: number, spread: number): PaceRange => {
    const p = paceAt(f, vdot);
    return { fast: p - spread, slow: p + spread };
  };
  return {
    easy: { fast: paceAt(0.7, vdot), slow: paceAt(0.62, vdot) },
    marathon: around(0.8, 5),
    threshold: around(0.88, 4),
    interval: around(0.975, 4),
    repetition: around(1.05, 4),
  };
}

/** Predicted finish time (s) for a distance at the given VDOT. */
export function predictTime(vdot: number, km: number): number {
  let lo = 60;
  let hi = 60 * 60 * 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    // A longer time means a lower VDOT.
    if (vdotFromRace(km, mid) > vdot) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type HrZones = { easyMax: number; thresholdLow: number; thresholdHigh: number };

/** Heart-rate guide rails: Karvonen when resting HR is known, otherwise % of max. */
export function hrZones(hrMax: number, hrRest?: number): HrZones {
  const at = (pctMax: number, pctReserve: number) =>
    Math.round(hrRest ? hrRest + pctReserve * (hrMax - hrRest) : pctMax * hrMax);
  return {
    easyMax: at(0.79, 0.7),
    thresholdLow: at(0.86, 0.8),
    thresholdHigh: at(0.92, 0.88),
  };
}

/** Rough max HR estimate when the runner does not know theirs (Tanaka would need age). */
export function estimateHrMax(observedPeaks: number[]): number | undefined {
  const peak = Math.max(0, ...observedPeaks);
  return peak >= 150 ? peak + 5 : undefined;
}
