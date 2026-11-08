import { useMemo, useState, type ReactNode } from "react";
import { addDays, DAY_LONG, DAY_SHORT, fmtDuration, fmtPace, today } from "../lib/format";
import { generatePlan, RACE_DISTANCES } from "../lib/plan";
import type { GoalType, Plan, Profile } from "../lib/types";
import { DurationInput } from "./common";
import { predictTime, trainingPaces, vdotFromRace } from "../lib/vdot";

const GOALS: { type: GoalType; title: string; text: string }[] = [
  { type: "race", title: "Konkretne zawody", text: "Plan rozpisany pod datę startu, z roztrenowaniem przed biegiem." },
  { type: "fitness", title: "Lepsza forma", text: "12 tygodni, żeby szybciej biegać 5 i 10 km." },
  { type: "consistency", title: "Regularne bieganie", text: "Spokojny rytm, głównie lekkie biegi. Dobre na start." },
];

type Draft = {
  goal: GoalType;
  raceKm: number;
  raceDate: string;
  targetSec: number | null;
  recentKm: number;
  recentSec: number | null;
  weeklyKm: string;
  hrMax: string;
  hrRest: string;
  days: number[];
  longRunDay: number;
};

function toDraft(p?: Profile | null): Draft {
  return {
    goal: p?.goal.type ?? "fitness",
    raceKm: p?.goal.raceKm ?? 10,
    raceDate: p?.goal.raceDate ?? addDays(today(), 70),
    targetSec: p?.goal.targetSec ?? null,
    recentKm: p?.recent.km ?? 5,
    recentSec: p?.recent.sec ?? null,
    weeklyKm: p ? String(p.weeklyKm) : "",
    hrMax: p?.hrMax ? String(p.hrMax) : "",
    hrRest: p?.hrRest ? String(p.hrRest) : "",
    days: p?.days ?? [1, 3, 6],
    longRunDay: p?.longRunDay ?? 6,
  };
}

const intOrUndef = (s: string, min: number, max: number) => {
  const n = Number(s);
  return s.trim() && Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : undefined;
};

export function Onboarding({
  initial,
  onDone,
  onCancel,
}: {
  initial?: Profile | null;
  onDone: (profile: Profile, plan: Plan) => Promise<void>;
  onCancel?: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const steps = d.goal === "race" ? ["goal", "race", "level", "hr", "days", "summary"] : ["goal", "level", "hr", "days", "summary"];
  const current = steps[Math.min(step, steps.length - 1)];

  const { recentSec, targetSec } = d;
  const recentValid = recentSec !== null && Number.isFinite(recentSec) && recentSec / d.recentKm >= 150 && recentSec / d.recentKm <= 720;
  const weeklyKm = intOrUndef(d.weeklyKm, 0, 250);

  const valid: Record<string, boolean> = {
    goal: true,
    race: d.raceDate >= addDays(today(), 7) && (targetSec === null || (Number.isFinite(targetSec) && targetSec > 0)),
    level: recentValid && weeklyKm !== undefined,
    hr: (!d.hrMax || intOrUndef(d.hrMax, 140, 230) !== undefined) && (!d.hrRest || intOrUndef(d.hrRest, 30, 100) !== undefined),
    days: d.days.length >= 2,
    summary: true,
  };

  const profile = useMemo<Profile | null>(() => {
    if (!recentValid || weeklyKm === undefined) return null;
    const longRunDay = d.days.includes(d.longRunDay) ? d.longRunDay : Math.max(...d.days);
    return {
      goal:
        d.goal === "race"
          ? { type: "race", raceKm: d.raceKm, raceDate: d.raceDate, targetSec: targetSec || undefined }
          : { type: d.goal },
      recent: { km: d.recentKm, sec: recentSec! },
      weeklyKm,
      hrMax: intOrUndef(d.hrMax, 140, 230),
      hrRest: intOrUndef(d.hrRest, 30, 100),
      days: [...d.days].sort((a, b) => a - b),
      longRunDay,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      // A new goal starts a new training block; upcoming events carry over.
      planStart: today(),
      events: (initial?.events ?? []).filter((e) => (e.endDate ?? e.date) >= today()),
    };
  }, [d, recentSec, recentValid, targetSec, weeklyKm, initial?.createdAt]);

  async function finish() {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      await onDone(profile, generatePlan(profile));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.message ? e.message : "Nie udało się zapisać planu.");
      setSaving(false);
    }
  }

  const next = () => (current === "summary" ? finish() : setStep((s) => s + 1));

  return (
    <main className="onboarding">
      <div className="ob-top">
        {step > 0 ? (
          <button className="icon-btn" onClick={() => setStep((s) => s - 1)} aria-label="Wstecz">
            <BackIcon />
          </button>
        ) : onCancel ? (
          <button className="text-btn" onClick={onCancel}>
            Anuluj
          </button>
        ) : (
          <span />
        )}
        <div className="ob-progress" role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>
          {steps.map((s, i) => (
            <span key={s} className={i <= step ? "on" : ""} />
          ))}
        </div>
      </div>

      {current === "goal" && (
        <Step title="Do czego się przygotowujesz?">
          <div className="choice-list">
            {GOALS.map((g) => (
              <button key={g.type} className={`choice ${d.goal === g.type ? "selected" : ""}`} onClick={() => set({ goal: g.type })}>
                <strong>{g.title}</strong>
                <span>{g.text}</span>
              </button>
            ))}
          </div>
        </Step>
      )}

      {current === "race" && (
        <Step title="Jaki start?">
          <Field label="Dystans" group>
            <Chips options={RACE_DISTANCES.map((r) => ({ value: r.km, label: r.label }))} value={d.raceKm} onChange={(raceKm) => set({ raceKm })} />
          </Field>
          <Field label="Data startu">
            <input type="date" value={d.raceDate} min={addDays(today(), 7)} onChange={(e) => set({ raceDate: e.target.value })} />
          </Field>
          <Field label="Czas docelowy" hint="Opcjonalnie. Bez niego tempo startowe wyliczymy z formy." group>
            <DurationInput label="Czas docelowy" units={["h", "m"]} placeholder={["0", "55"]} value={targetSec} onChange={(targetSec) => set({ targetSec })} />
          </Field>
        </Step>
      )}

      {current === "level" && (
        <Step title="Gdzie jesteś teraz?" lead="Na tej podstawie policzymy Twoje tempa treningowe.">
          <Field label="Najlepszy wynik z ostatnich 2–3 miesięcy" group>
            <Chips options={[{ value: 5, label: "5 km" }, { value: 10, label: "10 km" }]} value={d.recentKm} onChange={(recentKm) => set({ recentKm })} />
          </Field>
          <Field label={`Czas na ${d.recentKm} km`} hint="Może być z treningu, jeśli biegłeś mocno." group>
            <DurationInput
              label={`Czas na ${d.recentKm} km`}
              units={["m", "s"]}
              placeholder={d.recentKm === 5 ? ["27", "30"] : ["58", "00"]}
              value={recentSec}
              onChange={(recentSec) => set({ recentSec })}
            />
          </Field>
          <Field label="Ile km biegasz tygodniowo?" hint="Średnio z ostatniego miesiąca.">
            <div className="input-unit">
              <input inputMode="numeric" placeholder="np. 20" value={d.weeklyKm} onChange={(e) => set({ weeklyKm: e.target.value })} />
              <span>km</span>
            </div>
          </Field>
        </Step>
      )}

      {current === "hr" && (
        <Step title="Tętno" lead="Opcjonalne, ale dzięki niemu apka powie Ci, czy spokojne biegi są naprawdę spokojne.">
          <Field label="Tętno maksymalne" hint="Najwyższe, jakie widziałeś na zegarku przy mocnym finiszu. Jeśli nie znasz, zostaw puste – oszacujemy je z Twoich międzyczasów.">
            <div className="input-unit">
              <input inputMode="numeric" placeholder="np. 192" value={d.hrMax} onChange={(e) => set({ hrMax: e.target.value })} />
              <span>bpm</span>
            </div>
          </Field>
          <Field label="Tętno spoczynkowe" hint="Rano, zaraz po przebudzeniu. Garmin pokazuje je w widżecie tętna.">
            <div className="input-unit">
              <input inputMode="numeric" placeholder="np. 52" value={d.hrRest} onChange={(e) => set({ hrRest: e.target.value })} />
              <span>bpm</span>
            </div>
          </Field>
        </Step>
      )}

      {current === "days" && (
        <Step title="Kiedy możesz biegać?" lead="Wybierz co najmniej 2 dni. Najlepiej z przerwami między nimi.">
          <div className="day-picker">
            {DAY_SHORT.map((label, i) => {
              const on = d.days.includes(i);
              return (
                <button
                  key={label}
                  className={on ? "selected" : ""}
                  aria-pressed={on}
                  onClick={() => set({ days: on ? d.days.filter((x) => x !== i) : [...d.days, i] })}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {d.days.length >= 2 && (
            <Field label="Dzień długiego wybiegania" group>
              <Chips
                options={[...d.days].sort((a, b) => a - b).map((i) => ({ value: i, label: DAY_LONG[i] }))}
                value={d.days.includes(d.longRunDay) ? d.longRunDay : Math.max(...d.days)}
                onChange={(longRunDay) => set({ longRunDay })}
              />
            </Field>
          )}
        </Step>
      )}

      {current === "summary" && profile && <Summary profile={profile} />}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="ob-actions">
        <button className="primary" disabled={!valid[current] || saving} onClick={next}>
          {current === "summary" ? (saving ? "Tworzę plan…" : initial ? "Przelicz plan" : "Utwórz plan") : "Dalej"}
        </button>
      </div>
    </main>
  );
}

function BackIcon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function Summary({ profile }: { profile: Profile }) {
  const vdot = vdotFromRace(profile.recent.km, profile.recent.sec);
  const p = trainingPaces(vdot);
  const rows = [
    { name: "Spokojnie", pace: `${fmtPace(p.easy.fast)}–${fmtPace(p.easy.slow)}`, use: "większość biegów" },
    { name: "Próg", pace: fmtPace((p.threshold.fast + p.threshold.slow) / 2), use: "biegi progowe" },
    { name: "Interwały", pace: fmtPace((p.interval.fast + p.interval.slow) / 2), use: "odcinki 1000 m" },
  ];
  return (
    <Step title="Twoje tempa" lead={`Forma (VDOT) ${vdot.toFixed(1)}. Plan dostosuje się, gdy zaktualizujesz wynik.`}>
      <div className="pace-table">
        {rows.map((r) => (
          <div key={r.name} className="pace-row">
            <span>{r.name}</span>
            <strong>
              {r.pace}
              <small>/km</small>
            </strong>
            <em>{r.use}</em>
          </div>
        ))}
      </div>
      {profile.goal.type === "race" && profile.goal.raceKm && (
        <p className="note">
          Prognoza na dziś: <strong>{fmtDuration(predictTime(vdot, profile.goal.raceKm))}</strong>
          {profile.goal.targetSec ? <> · cel {fmtDuration(profile.goal.targetSec)}</> : null}
        </p>
      )}
    </Step>
  );
}

function Step({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="ob-step">
      <h1>{title}</h1>
      {lead && <p className="lead">{lead}</p>}
      <div className="ob-fields">{children}</div>
    </section>
  );
}

/** `group` renders a fieldset-like div so chip buttons are not hijacked by a wrapping <label>. */
function Field({ label, hint, group, children }: { label: string; hint?: string; group?: boolean; children: ReactNode }) {
  const inner = (
    <>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </>
  );
  return group ? (
    <div className="field" role="group" aria-label={label}>
      {inner}
    </div>
  ) : (
    <label className="field">{inner}</label>
  );
}

function Chips<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="chips" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? "selected" : ""}
          onClick={(e) => {
            e.preventDefault();
            onChange(o.value);
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
