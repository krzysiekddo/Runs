/** Dates are local calendar days formatted as YYYY-MM-DD. Paces are seconds per km. */

export type GoalType = "race" | "fitness" | "consistency";

export type Goal = {
  type: GoalType;
  /** Race distance in km (5, 10, 21.0975, 42.195). */
  raceKm?: number;
  raceDate?: string;
  /** Target finish time in seconds. */
  targetSec?: number;
};

export type Profile = {
  goal: Goal;
  /** Recent best effort used to estimate fitness. */
  recent: { km: number; sec: number };
  weeklyKm: number;
  hrMax?: number;
  hrRest?: number;
  /** Training days, 0 = Monday … 6 = Sunday. */
  days: number[];
  longRunDay: number;
  createdAt: string;
  /** First day of the current training block; weeks and phases count from its Monday. */
  planStart?: string;
  events?: PlanEvent[];
  shoes?: Shoe[];
};

/** Mileage entered by hand; runs logged after `setAt` are added on top of `baseKm`. */
export type Shoe = {
  name: string;
  baseKm: number;
  setAt: string;
};

/**
 * Something that interrupts the plan: another race ("race") or days without running ("off").
 * A race run "workout" (as a hard training run) needs less recovery than one run all-out.
 */
export type PlanEvent = {
  id: string;
  type: "race" | "off";
  date: string;
  endDate?: string;
  km?: number;
  title?: string;
  effort?: "race" | "workout";
};

export type WorkoutType = "easy" | "long" | "tempo" | "intervals" | "strides" | "race";

export type PaceRange = { fast: number; slow: number };

export type Workout = {
  id: string;
  date: string;
  type: WorkoutType;
  title: string;
  km: number;
  /** Pace for the key part of the session. */
  pace: PaceRange;
  /** Human-readable structure, e.g. "2 km rozgrzewki · 4×1 km I · 2 km schłodzenia". */
  details: string;
};

export type Phase = "base" | "build" | "peak" | "taper";

export type PlanWeek = {
  index: number;
  start: string;
  /** Fitness the paces of this week are based on. */
  vdot: number;
  phase: Phase;
  km: number;
  deload: boolean;
  workouts: Workout[];
};

export type Plan = {
  generatedAt: string;
  /** Fitness assumed for the current week (after adjustment from logged runs). */
  vdot: number;
  startVdot: number;
  /** Fitness the plan builds towards by its last week. */
  endVdot: number;
  /** Fitness the runner's target time would need, when a target is set. */
  goalVdot?: number;
  /** Shift applied from the current week on, based on logged runs. */
  adjustment?: { delta: number; source?: "race" | "tempo" | "hr"; runs: number };
  weeks: PlanWeek[];
};

export type Split = { paceSec: number; hr?: number };

export type Run = {
  id: string;
  date: string;
  km: number;
  movingSec: number;
  avgHr?: number;
  elevationM?: number;
  kcal?: number;
  shoe?: string;
  title?: string;
  /** 1 = bardzo lekko … 5 = bardzo ciężko */
  effort?: number;
  notes?: string;
  splits?: Split[];
  createdAt: string;
};
