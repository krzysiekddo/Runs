import { effectiveHrMax, evaluateRun } from "../lib/analysis";
import { addDays, DAY_SHORT, fmtDate, fmtKmShort, fmtPace, fmtRelativeDay, today } from "../lib/format";
import { PHASE_LABEL, weekOf, workoutOn } from "../lib/plan";
import type { Run, Workout } from "../lib/types";
import { hrZones } from "../lib/vdot";
import { Icon, SettingsButton, TypeTag, useApp } from "./common";
import { RunRow } from "./Runs";

export function Today() {
  const { plan, runs, profile, addRun, openRun } = useApp();
  const t = today();
  const workout = workoutOn(plan, t);
  const todaysRun = runs.find((r) => r.date === t);
  const upcoming = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.date > t).slice(0, 3);
  const hrMax = effectiveHrMax(profile, runs).value;
  const easyHr = hrMax ? hrZones(hrMax, profile.hrRest).easyMax : undefined;
  const planEnded = !upcoming.length && !workout;

  return (
    <div className="screen">
      <header className="screen-head row-between">
        <p className="date-line">{fmtDate(t, { weekday: "long", day: "numeric", month: "long" })}</p>
        <SettingsButton />
      </header>

      {workout ? (
        <WorkoutHero workout={workout} run={todaysRun} easyHr={easyHr} onAdd={() => addRun(t)} onOpen={openRun} />
      ) : (
        <section className="hero t-rest">
          <h1 className="hero-title">{planEnded ? "Plan zakończony" : "Dziś odpoczynek"}</h1>
          <p className="hero-details">
            {planEnded
              ? "Ustaw nowy cel w zakładce Postępy, żeby wygenerować kolejny blok treningowy."
              : upcoming[0]
                ? `${fmtRelativeDay(upcoming[0].date)}: ${upcoming[0].title.toLowerCase()}, ${fmtKmShort(upcoming[0].km)} km.`
                : ""}
          </p>
          {todaysRun ? (
            <button className="hero-done" onClick={() => openRun(todaysRun)}>
              <Icon name="check" size={18} /> Dziś: {fmtKmShort(todaysRun.km)} km w {fmtPace(todaysRun.movingSec / todaysRun.km)}/km
            </button>
          ) : (
            <button className="hero-btn ghost" onClick={() => addRun(t)}>
              Dodaj bieg mimo to
            </button>
          )}
        </section>
      )}

      <WeekStrip />

      {upcoming.length > 0 && (
        <section className="block">
          <h2 className="block-title">Następne treningi</h2>
          <ul className="list">
            {upcoming.map((w) => (
              <li key={w.id} className="row">
                <span className={`row-bar t-${w.type}`} />
                <div className="row-main">
                  <strong>{w.title}</strong>
                  <span className="muted">{fmtRelativeDay(w.date)}</span>
                </div>
                <span className="row-num">
                  {fmtKmShort(w.km)}
                  <small>km</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {runs[0] && runs[0].date !== t && (
        <section className="block">
          <h2 className="block-title">Ostatni bieg</h2>
          <ul className="list">
            <RunRow run={runs[0]} />
          </ul>
        </section>
      )}
    </div>
  );
}

function WorkoutHero({ workout, run, easyHr, onAdd, onOpen }: { workout: Workout; run?: Run; easyHr?: number; onAdd: () => void; onOpen: (r: Run) => void }) {
  const { profile, runs } = useApp();
  // Pastel orange until done; green when it matched the plan, yellow when it did not.
  const verdict = run ? evaluateRun(run, workout, profile, runs) : undefined;
  const status = !verdict ? "s-pending" : verdict.tone === "warn" ? "s-warn" : "s-done";
  const easy = workout.type === "easy" || workout.type === "long" || workout.type === "strides";
  const pace =
    workout.pace.slow - workout.pace.fast > 15
      ? `${fmtPace(workout.pace.fast)}–${fmtPace(workout.pace.slow)}`
      : fmtPace((workout.pace.fast + workout.pace.slow) / 2);
  return (
    <section className={`hero t-${workout.type} ${status}`}>
      <div className="hero-top">
        <TypeTag type={workout.type} />
        {run && (
          <span className="hero-check">
            <Icon name="check" size={16} /> {status === "s-warn" ? "Zrobione, z uwagami" : "Zrobione"}
          </span>
        )}
      </div>
      <h1 className="hero-title">{workout.title}</h1>
      <p className="hero-km">
        {fmtKmShort(workout.km)}
        <span>km</span>
      </p>
      <p className="hero-pace">
        {easy ? "Tempo" : "Mocne odcinki"} {pace} /km
        {easy && easyHr ? <>, tętno do {easyHr}</> : null}
      </p>
      <p className="hero-details">{workout.details}</p>
      {run ? (
        <button className="hero-btn" onClick={() => onOpen(run)}>
          Zobacz ocenę biegu
        </button>
      ) : (
        <button className="hero-btn" onClick={onAdd}>
          <Icon name="plus" size={18} /> Dodaj bieg
        </button>
      )}
    </section>
  );
}

function WeekStrip() {
  const { plan, runs } = useApp();
  const t = today();
  const week = weekOf(plan, t);
  const start = week?.start ?? addDays(t, -((new Date().getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const w = workoutOn(plan, date);
    const done = runs.filter((r) => r.date === date).reduce((s, r) => s + r.km, 0);
    return { date, w, done };
  });
  const max = Math.max(1, ...days.map((d) => Math.max(d.w?.km ?? 0, d.done)));
  const doneKm = days.reduce((s, d) => s + d.done, 0);
  const plannedKm = week?.km ?? days.reduce((s, d) => s + (d.w?.km ?? 0), 0);

  return (
    <section className="block week">
      <div className="week-head">
        <h2 className="block-title">
          Ten tydzień
          {week && <span className="muted"> – {PHASE_LABEL[week.phase].toLowerCase()}{week.deload ? ", lżejszy" : ""}</span>}
        </h2>
        <p className="week-total">
          <strong>{fmtKmShort(doneKm)}</strong> z {fmtKmShort(plannedKm)} km
        </p>
      </div>
      <div className="week-bars">
        {days.map(({ date, w, done }, i) => {
          const planned = w?.km ?? 0;
          const h = (Math.max(planned, done) / max) * 100;
          const state = done > 0 ? "done" : date < t && planned ? "missed" : "planned";
          return (
            <div key={date} className={`wb ${date === t ? "today" : ""}`}>
              <div className="wb-track">
                {(planned > 0 || done > 0) && (
                  <div
                    className={`wb-bar ${w ? `t-${w.type}` : "t-extra"} ${state}`}
                    style={{ height: `${Math.max(h, 8)}%` }}
                    title={`${w?.title ?? "Bieg"}: ${fmtKmShort(done || planned)} km`}
                  />
                )}
              </div>
              <span className="wb-day">{DAY_SHORT[i]}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
