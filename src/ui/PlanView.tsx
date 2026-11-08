import { useState } from "react";
import { addDays, DAY_SHORT, fmtDate, fmtDuration, fmtKmShort, fmtPace, today, weekday } from "../lib/format";
import { predictTime, trainingPaces } from "../lib/vdot";
import { PHASE_LABEL, raceLabel } from "../lib/plan";
import type { PlanWeek, Workout } from "../lib/types";
import { Icon, Sheet, useApp } from "./common";
import { EventEditor, EventsBlock } from "./Events";
import type { PlanEvent } from "../lib/types";

export function PlanView() {
  const { plan, profile } = useApp();
  const t = today();
  const [showPast, setShowPast] = useState(false);
  // undefined = closed, null = new event
  const [editing, setEditing] = useState<PlanEvent | null | undefined>(undefined);
  const currentIdx = plan.weeks.findIndex((w) => t < addDays(w.start, 7));
  const weeks = showPast ? plan.weeks : plan.weeks.slice(Math.max(0, currentIdx));
  const g = profile.goal;

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="screen-title">Plan</h1>
        <p className="muted">
          {g.type === "race" && g.raceKm && g.raceDate
            ? `${raceLabel(g.raceKm)}, ${fmtDate(g.raceDate, { day: "numeric", month: "long" })}`
            : g.type === "fitness"
              ? "Blok na lepszą formę"
              : "Regularne bieganie"}
          {`, ${plan.weeks.length} tygodni`}
        </p>
      </header>

      <FitnessNote />

      <EventsBlock onOpen={setEditing} />

      {currentIdx > 0 && (
        <button className="text-btn" onClick={() => setShowPast((s) => !s)}>
          {showPast ? "Ukryj poprzednie tygodnie" : `Pokaż poprzednie tygodnie (${currentIdx})`}
        </button>
      )}

      {weeks.map((w) => (
        <Week key={w.index} week={w} current={w.index === currentIdx} />
      ))}

      {editing !== undefined && (
        <Sheet title={editing ? "Edytuj wydarzenie" : "Nowe wydarzenie"} onClose={() => setEditing(undefined)}>
          <EventEditor event={editing} onDone={() => setEditing(undefined)} />
        </Sheet>
      )}
    </div>
  );
}

function Week({ week, current }: { week: PlanWeek; current: boolean }) {
  const { runs } = useApp();
  const end = addDays(week.start, 6);
  const done = runs.filter((r) => r.date >= week.start && r.date <= end).reduce((s, r) => s + r.km, 0);
  return (
    <section className={`plan-week ${current ? "current" : ""}`}>
      <header className="pw-head">
        <div>
          <h2>Tydzień {week.index + 1}</h2>
          <p className="muted">
            {fmtDate(week.start)} – {fmtDate(end)}, {PHASE_LABEL[week.phase].toLowerCase()}
            {week.deload ? ", lżejszy" : ""}
          </p>
        </div>
        <p className="pw-km">
          {done > 0 && <span className="muted">{fmtKmShort(done)} / </span>}
          {week.km}
          <small> km</small>
        </p>
      </header>
      <ul className="list">
        {week.workouts.map((w) => (
          <WorkoutRow key={w.id} w={w} />
        ))}
      </ul>
    </section>
  );
}

function WorkoutRow({ w }: { w: Workout }) {
  const { runs, addRun, openRun } = useApp();
  const [open, setOpen] = useState(false);
  const t = today();
  const run = runs.find((r) => r.date === w.date);
  const missed = !run && w.date < t;
  const pace = w.type === "tempo" || w.type === "intervals" || w.type === "race"
    ? fmtPace((w.pace.fast + w.pace.slow) / 2)
    : `${fmtPace(w.pace.fast)}–${fmtPace(w.pace.slow)}`;

  return (
    <li className={`wrow ${missed ? "missed" : ""} ${w.date === t ? "is-today" : ""}`}>
      <button className="row row-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="wrow-day">
          <strong>{DAY_SHORT[weekday(w.date)]}</strong>
          <span>{Number(w.date.slice(8))}</span>
        </span>
        <span className={`row-bar t-${w.type}`} />
        <div className="row-main">
          <strong>{w.title}</strong>
          <span className="muted">{pace} /km</span>
        </div>
        {run ? (
          <span className="done-mark" aria-label="Wykonany">
            <Icon name="check" size={18} />
          </span>
        ) : null}
        <span className="row-num">
          {fmtKmShort(w.km)}
          <small>km</small>
        </span>
      </button>
      {open && (
        <div className="wrow-more">
          <p>{w.details}</p>
          {run ? (
            <button className="text-btn" onClick={() => openRun(run)}>
              Zobacz bieg: {fmtKmShort(run.km)} km
            </button>
          ) : w.date <= t ? (
            <button className="text-btn" onClick={() => addRun(w.date)}>
              Dodaj bieg z tego dnia
            </button>
          ) : null}
        </div>
      )}
    </li>
  );
}

const SOURCE_TEXT = {
  race: "wynik ze startu",
  tempo: "odcinki z biegów progowych",
  hr: "tętno na spokojnych biegach",
} as const;

const fmtV = (v: number) => v.toLocaleString("pl-PL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Shows how paces progress through the plan and why they moved. */
function FitnessNote() {
  const { plan, profile } = useApp();
  const t = today();
  const nowWeek = plan.weeks.find((w) => t < addDays(w.start, 7)) ?? plan.weeks[0];
  const lastBuild = [...plan.weeks].reverse().find((w) => w.phase !== "taper") ?? plan.weeks[plan.weeks.length - 1];
  const now = trainingPaces(nowWeek.vdot);
  const end = trainingPaces(lastBuild.vdot);
  const mid = (r: { fast: number; slow: number }) => fmtPace((r.fast + r.slow) / 2);
  const adj = plan.adjustment;
  const g = profile.goal;
  const ambitious = plan.goalVdot !== undefined && plan.goalVdot > plan.endVdot + 0.3 && g.raceKm && g.targetSec;

  return (
    <section className="fitness">
      <div className="fitness-rows">
        <div>
          <span className="muted">Próg</span>
          <strong>
            {mid(now.threshold)} → {mid(end.threshold)}
          </strong>
        </div>
        <div>
          <span className="muted">Interwały</span>
          <strong>
            {mid(now.interval)} → {mid(end.interval)}
          </strong>
        </div>
        <div>
          <span className="muted">Spokojnie</span>
          <strong>
            {fmtPace(now.easy.fast)} → {fmtPace(end.easy.fast)}
          </strong>
        </div>
      </div>
      <p className="muted small">
        Tempa przyspieszają razem z formą: VDOT {fmtV(nowWeek.vdot)} teraz, {fmtV(lastBuild.vdot)} pod koniec planu.
      </p>
      {adj && Math.abs(adj.delta) >= 0.2 && (
        <p className={`small ${adj.delta > 0 ? "good-text" : "warn-text"}`}>
          {adj.delta > 0 ? "Forma lepsza" : "Forma słabsza"} niż zakładał plan ({adj.delta > 0 ? "+" : "−"}
          {fmtV(Math.abs(adj.delta))} VDOT, {adj.source ? SOURCE_TEXT[adj.source] : ""}). Tempa od tego tygodnia są{" "}
          {adj.delta > 0 ? "szybsze" : "wolniejsze"}.
        </p>
      )}
      {ambitious && (
        <p className="small warn-text">
          Cel {fmtDuration(g.targetSec!)} na {raceLabel(g.raceKm!)} wymaga formy VDOT {fmtV(plan.goalVdot!)}. W tym czasie realny jest
          poziom ok. {fmtV(plan.endVdot)}, czyli ok. {fmtDuration(predictTime(plan.endVdot, g.raceKm!))}. Plan nie każe biec szybciej, niż
          pozwala forma – jeśli będziesz robić postępy szybciej, tempa same się przesuną.
        </p>
      )}
    </section>
  );
}
