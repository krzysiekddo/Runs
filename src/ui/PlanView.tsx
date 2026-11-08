import { useState } from "react";
import { addDays, DAY_SHORT, fmtDate, fmtKmShort, fmtPace, today, weekday } from "../lib/format";
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
