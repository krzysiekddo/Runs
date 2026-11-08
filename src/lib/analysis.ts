// Compares a logged run with the planned workout and produces a short verdict.
import { fmtKmShort, fmtPace } from "./format.ts";
import type { Profile, Run, Workout } from "./types.ts";
import { estimateHrMax, hrZones } from "./vdot.ts";

export type Tone = "good" | "warn" | "info";
export type Verdict = { headline: string; tone: Tone; points: { tone: Tone; text: string }[] };

export const runPace = (run: Run) => run.movingSec / run.km;

export function effectiveHrMax(profile: Profile | null | undefined, runs: Run[]): { value?: number; estimated: boolean } {
  if (profile?.hrMax) return { value: profile.hrMax, estimated: false };
  const peaks = runs.flatMap((r) => (r.splits ?? []).map((s) => s.hr ?? 0));
  return { value: estimateHrMax(peaks), estimated: true };
}

export function evaluateRun(run: Run, workout: Workout | undefined, profile: Profile | null | undefined, allRuns: Run[]): Verdict {
  const points: Verdict["points"] = [];
  const pace = runPace(run);
  const hrMax = effectiveHrMax(profile, allRuns).value;
  const zones = hrMax ? hrZones(hrMax, profile?.hrRest) : undefined;

  if (!workout) {
    points.push({ tone: "info", text: "Bieg poza planem – liczy się do tygodniowego kilometrażu." });
    if (zones && run.avgHr && run.avgHr > zones.easyMax) {
      points.push({ tone: "warn", text: `Średnie tętno ${run.avgHr} – powyżej strefy spokojnej (do ${zones.easyMax}).` });
    }
    return { headline: "Bieg dodatkowy", tone: "info", points };
  }

  const ratio = run.km / workout.km;
  let complete = true;
  if (ratio >= 0.9) points.push({ tone: "good", text: `Dystans zgodny z planem (${fmtKmShort(workout.km)} km).` });
  else {
    complete = ratio >= 0.75;
    points.push({ tone: "warn", text: `O ${fmtKmShort(workout.km - run.km)} km krócej niż w planie.` });
  }

  const easyType = workout.type === "easy" || workout.type === "long" || workout.type === "strides";
  if (easyType) {
    if (pace < workout.pace.fast - 10) {
      points.push({ tone: "warn", text: `Tempo ${fmtPace(pace)}/km – szybciej niż spokojne ${fmtPace(workout.pace.fast)}–${fmtPace(workout.pace.slow)}. Spokojne biegi mają budować bazę, nie męczyć.` });
    } else {
      points.push({ tone: "good", text: `Tempo ${fmtPace(pace)}/km mieści się w strefie spokojnej.` });
    }
    if (zones && run.avgHr) {
      if (run.avgHr > zones.easyMax) {
        points.push({ tone: "warn", text: `Średnie tętno ${run.avgHr} – powyżej strefy spokojnej (do ${zones.easyMax}). Następnym razem zwolnij, nawet jeśli tempo wyda się bardzo wolne.` });
      } else {
        points.push({ tone: "good", text: `Tętno ${run.avgHr} w strefie spokojnej.` });
      }
    }
  } else if (workout.type === "tempo" || workout.type === "intervals") {
    const target = workout.pace.slow + 10;
    const fast = (run.splits ?? []).filter((s) => s.paceSec <= target).length;
    if (run.splits?.length) {
      points.push({
        tone: fast > 0 ? "good" : "warn",
        text: fast
          ? `${fast} km w tempie ${workout.type === "tempo" ? "progowym" : "interwałowym"} lub szybciej.`
          : `Żaden kilometr nie był w docelowym tempie ${fmtPace(workout.pace.fast)}/km.`,
      });
    } else {
      points.push({ tone: "info", text: "Dodaj screen z międzyczasami, żeby ocenić mocne odcinki." });
    }
  } else if (workout.type === "race") {
    points.push({ tone: "good", text: `Wynik: średnio ${fmtPace(pace)}/km. Gratulacje!` });
  }

  const splits = run.splits ?? [];
  if (splits.length >= 3) {
    const last = splits[splits.length - 1].paceSec;
    const rest = splits.slice(0, -1).reduce((s, x) => s + x.paceSec, 0) / (splits.length - 1);
    if (rest - last > 20) points.push({ tone: "info", text: `Mocny finisz – ostatni km ${fmtPace(last)}/km.` });
  }

  const warn = points.some((p) => p.tone === "warn");
  return {
    headline: !complete ? "Wykonany częściowo" : warn ? "Wykonany – z uwagami" : "Wykonany zgodnie z planem",
    tone: !complete || warn ? "warn" : "good",
    points,
  };
}
