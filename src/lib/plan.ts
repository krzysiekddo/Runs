// Rule-based training plan generator: periodized weeks, ~8% weekly growth, deload every 4th week.
import { addDays, daysBetween, mondayOf, today } from "./format.ts";
import type { Phase, Plan, PlanWeek, Profile, Workout, WorkoutType } from "./types.ts";
import { predictTime, trainingPaces, vdotFromRace, type TrainingPaces } from "./vdot.ts";

export const RACE_DISTANCES = [
  { km: 5, label: "5 km" },
  { km: 10, label: "10 km" },
  { km: 21.0975, label: "Półmaraton" },
  { km: 42.195, label: "Maraton" },
];

export function raceLabel(km: number): string {
  return RACE_DISTANCES.find((r) => Math.abs(r.km - km) < 0.01)?.label ?? `${km} km`;
}

export const WORKOUT_LABEL: Record<WorkoutType, string> = {
  easy: "Spokojny",
  long: "Długi",
  tempo: "Próg",
  intervals: "Interwały",
  strides: "Przebieżki",
  race: "Start",
};

const round05 = (x: number) => Math.max(0.5, Math.round(x * 2) / 2);

/** Peak weekly volume and longest run per goal. */
function targets(profile: Profile, startKm: number) {
  const g = profile.goal;
  if (g.type === "race" && g.raceKm) {
    if (g.raceKm <= 5) return { peak: Math.max(startKm * 1.4, 25), longCap: 12 };
    if (g.raceKm <= 10) return { peak: Math.max(startKm * 1.4, 35), longCap: 16 };
    if (g.raceKm <= 21.1) return { peak: Math.max(startKm * 1.4, 45), longCap: 21 };
    return { peak: Math.max(startKm * 1.4, 60), longCap: 32 };
  }
  if (g.type === "fitness") return { peak: Math.max(startKm * 1.3, 25), longCap: 15 };
  return { peak: startKm * 1.15, longCap: 12 };
}

function phasesFor(total: number, taper: number, consistency: boolean): Phase[] {
  const n = total - taper;
  if (consistency) return Array.from({ length: total }, (_, i) => (i < Math.ceil(n / 2) ? "base" : "build"));
  const base = Math.max(1, Math.ceil(n * 0.4));
  const build = Math.max(1, Math.round(n * 0.4));
  return Array.from({ length: total }, (_, i) =>
    i < base ? "base" : i < base + build ? "build" : i < n ? "peak" : "taper",
  );
}

/** Spread up to `count` quality days over the week, away from the long run and each other. */
function pickQualityDays(days: number[], longDay: number, count: number): number[] {
  const gap = (a: number, b: number) => Math.min(Math.abs(a - b), 7 - Math.abs(a - b));
  const picked: number[] = [];
  const candidates = days
    .filter((d) => d !== longDay)
    .sort((a, b) => gap(b, longDay) - gap(a, longDay) || a - b);
  for (const d of candidates) {
    if (picked.length >= count) break;
    if (gap(d, longDay) >= 2 && picked.every((p) => gap(p, d) >= 2)) picked.push(d);
  }
  for (const d of candidates) {
    if (picked.length >= count) break;
    if (!picked.includes(d) && gap(d, longDay) >= 1) picked.push(d);
  }
  return picked.sort((a, b) => a - b);
}

type Ctx = { paces: TrainingPaces; progress: number; weekKm: number };

/** One hard session should stay under ~30% of the week (incl. 4 km warm-up + cool-down). */
const qualityBudget = (ctx: Ctx) => Math.max(1.5, ctx.weekKm * 0.3 - 4);

function tempoWorkout(date: string, ctx: Ctx, light = false): Workout {
  const tMin = (ctx.paces.threshold.fast + ctx.paces.threshold.slow) / 120;
  const workMin = light ? 10 : Math.max(10, Math.min(Math.round(15 + 15 * ctx.progress), Math.floor(qualityBudget(ctx) * tMin)));
  const reps = workMin >= 20 ? 3 : 2;
  const len = Math.round(workMin / reps);
  const tPace = (ctx.paces.threshold.fast + ctx.paces.threshold.slow) / 2;
  const km = round05(4 + (reps * len * 60) / tPace + ((reps - 1) * 2 * 60) / ctx.paces.easy.slow);
  return {
    id: `w-${date}`,
    date,
    type: "tempo",
    title: "Bieg progowy",
    km,
    pace: ctx.paces.threshold,
    details: `2 km rozgrzewki · ${reps}×${len} min w tempie progowym (2 min truchtu) · 2 km schłodzenia`,
  };
}

function intervalWorkout(date: string, ctx: Ctx): Workout {
  const reps = Math.max(3, Math.min(Math.round(4 + 2 * ctx.progress), Math.floor(qualityBudget(ctx) / 1.4)));
  return {
    id: `w-${date}`,
    date,
    type: "intervals",
    title: "Interwały",
    km: round05(4 + reps * 1.4),
    pace: ctx.paces.interval,
    details: `2 km rozgrzewki · ${reps}×1000 m (400 m truchtu) · 2 km schłodzenia`,
  };
}

function easyWorkout(date: string, km: number, ctx: Ctx, strides = false): Workout {
  return {
    id: `w-${date}`,
    date,
    type: strides ? "strides" : "easy",
    title: strides ? "Spokojnie + przebieżki" : "Bieg spokojny",
    km: round05(Math.max(3, km)),
    pace: ctx.paces.easy,
    details: strides
      ? "Swobodny bieg, na koniec 6×20 s przebieżek (szybko, ale luźno) z marszem w przerwach"
      : "Tempo konwersacyjne – możesz mówić pełnymi zdaniami",
  };
}

function longWorkout(date: string, km: number, ctx: Ctx, phase: Phase): Workout {
  return {
    id: `w-${date}`,
    date,
    type: "long",
    title: "Długie wybieganie",
    km: round05(km),
    pace: ctx.paces.easy,
    details:
      phase === "base"
        ? "Równo i spokojnie od początku do końca"
        : "Spokojnie, ostatnie 2 km możesz lekko przyspieszyć",
  };
}

export function computeVdot(profile: Profile): number {
  return vdotFromRace(profile.recent.km, profile.recent.sec);
}

export function generatePlan(profile: Profile, startDate = today()): Plan {
  const vdot = computeVdot(profile);
  const paces = trainingPaces(vdot);
  const days = [...profile.days].sort((a, b) => a - b);
  const longDay = days.includes(profile.longRunDay) ? profile.longRunDay : days[days.length - 1];
  const firstMonday = mondayOf(startDate);
  const goal = profile.goal;

  const raceWeeks =
    goal.type === "race" && goal.raceDate ? Math.floor(daysBetween(firstMonday, goal.raceDate) / 7) + 1 : 0;
  const isRacePlan = raceWeeks >= 2 && raceWeeks <= 24 && !!goal.raceKm;
  const totalWeeks = isRacePlan ? raceWeeks : 12;
  const taper = isRacePlan ? (goal.raceKm! >= 21 ? 2 : 1) : 0;
  const phases = phasesFor(totalWeeks, taper, goal.type === "consistency");

  const startKm = Math.max(profile.weeklyKm, days.length * 4, 8);
  const { peak, longCap } = targets(profile, startKm);
  const qualityMax = goal.type === "consistency" ? 1 : days.length >= 5 ? 2 : 1;

  const weeks: PlanWeek[] = [];
  let volume = startKm;
  const trainingWeeks = totalWeeks - taper;

  for (let i = 0; i < totalWeeks; i++) {
    const phase = phases[i];
    const start = addDays(firstMonday, i * 7);
    const deload = phase !== "taper" && i > 0 && (i + 1) % 4 === 0;
    if (i > 0 && phase !== "taper") volume = Math.min(volume * 1.08, peak);
    let weekKm = deload ? volume * 0.8 : volume;
    if (phase === "taper") weekKm = i === totalWeeks - 1 ? peak * 0.5 : peak * 0.7;

    const ctx: Ctx = { paces, weekKm, progress: trainingWeeks > 1 ? Math.min(1, i / (trainingWeeks - 1)) : 1 };
    const dateOf = (d: number) => addDays(start, d);
    const workouts: Workout[] = [];
    const isRaceWeek = isRacePlan && i === totalWeeks - 1;

    if (isRaceWeek) {
      const raceDate = goal.raceDate!;
      const pre = days.filter((d) => dateOf(d) < raceDate && daysBetween(dateOf(d), raceDate) > 1);
      pre.forEach((d, j) =>
        workouts.push(j === 0 && pre.length > 1 ? tempoWorkout(dateOf(d), ctx, true) : easyWorkout(dateOf(d), 4, ctx, j === pre.length - 1)),
      );
      const racePace = (goal.targetSec ?? predictTime(vdot, goal.raceKm!)) / goal.raceKm!;
      workouts.push({
        id: `w-${raceDate}`,
        date: raceDate,
        type: "race",
        title: `Start: ${raceLabel(goal.raceKm!)}`,
        km: goal.raceKm!,
        pace: { fast: racePace - 3, slow: racePace + 3 },
        details: "Pierwszy kilometr spokojniej niż docelowe tempo, potem równo. Powodzenia!",
      });
    } else {
      const qualityCount = phase === "base" ? 0 : phase === "taper" ? 1 : qualityMax;
      const qualityDays = pickQualityDays(days, longDay, Math.min(qualityCount, days.length - 1));
      const quality = new Map<number, Workout>();
      qualityDays.forEach((d, j) => {
        const date = dateOf(d);
        const w =
          phase === "build"
            ? j === 0 ? tempoWorkout(date, ctx) : intervalWorkout(date, ctx)
            : phase === "peak"
              ? j === 0 ? intervalWorkout(date, ctx) : tempoWorkout(date, ctx)
              : tempoWorkout(date, ctx, true);
        quality.set(d, w);
      });

      // Split the easy volume so the long run is clearly the longest run of the week:
      // it weighs 1.6 easy runs and is at least 1 km longer than any hard session.
      const easyDays = days.filter((d) => d !== longDay && !quality.has(d));
      const qualityKm = [...quality.values()].reduce((sum, w) => sum + w.km, 0);
      const maxQualityKm = Math.max(0, ...[...quality.values()].map((w) => w.km));
      const easyVolume = Math.max(weekKm - qualityKm, 3 * (easyDays.length + 1));
      const cap = phase === "taper" ? longCap * 0.7 : longCap;
      let longKm = (easyVolume * 1.6) / (easyDays.length + 1.6);
      longKm = Math.min(cap, Math.max(longKm, maxQualityKm + 1));
      const easyKm = easyDays.length ? Math.max(3, (easyVolume - longKm) / easyDays.length) : 0;
      if (easyKm >= longKm) longKm = Math.min(cap, easyKm + 1);
      // In base weeks one easy run gets strides so speed is not neglected.
      const stridesDay = phase === "base" || qualityDays.length === 0 ? easyDays[easyDays.length - 1] : undefined;

      for (const d of days) {
        const date = dateOf(d);
        if (d === longDay) workouts.push(longWorkout(date, longKm, ctx, phase));
        else if (quality.has(d)) workouts.push(quality.get(d)!);
        else workouts.push(easyWorkout(date, easyKm, ctx, d === stridesDay));
      }
    }

    const visible = workouts.filter((w) => w.date >= startDate);
    weeks.push({
      index: i,
      start,
      phase,
      deload,
      km: Math.round(workouts.reduce((s, w) => s + w.km, 0)),
      workouts: visible.sort((a, b) => a.date.localeCompare(b.date)),
    });
  }

  return { generatedAt: new Date().toISOString(), vdot, weeks };
}

export function workoutOn(plan: Plan | null | undefined, date: string): Workout | undefined {
  return plan?.weeks.flatMap((w) => w.workouts).find((w) => w.date === date);
}

export function weekOf(plan: Plan | null | undefined, date: string): PlanWeek | undefined {
  return plan?.weeks.find((w) => date >= w.start && date < addDays(w.start, 7));
}

export const PHASE_LABEL: Record<Phase, string> = {
  base: "Baza",
  build: "Rozwój",
  peak: "Szczyt formy",
  taper: "Roztrenowanie",
};

