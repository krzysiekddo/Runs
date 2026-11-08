import { useState } from "react";
import { evaluateRun, runPace } from "../lib/analysis";
import { fmtDate, fmtDuration, fmtKm, fmtKmShort, fmtPace, fmtRelativeDay } from "../lib/format";
import { workoutOn } from "../lib/plan";
import { deleteRun } from "../lib/store";
import type { Run } from "../lib/types";
import { Icon, Stat, TypeTag, useApp } from "./common";

export function RunRow({ run }: { run: Run }) {
  const { plan, profile, runs, openRun } = useApp();
  const workout = workoutOn(plan, run.date);
  const verdict = evaluateRun(run, workout, profile, runs);
  return (
    <li>
      <button className="row row-btn" onClick={() => openRun(run)}>
        <span className={`row-bar ${workout ? `t-${workout.type}` : "t-extra"}`} />
        <div className="row-main">
          <strong>{run.title || workout?.title || "Bieg"}</strong>
          <span className="muted">
            {fmtRelativeDay(run.date)} · {fmtPace(runPace(run))}/km{run.avgHr ? ` · ${run.avgHr} bpm` : ""}
          </span>
        </div>
        <span className={`dot tone-${verdict.tone}`} aria-label={verdict.headline} />
        <span className="row-num">
          {fmtKmShort(run.km)}
          <small>km</small>
        </span>
      </button>
    </li>
  );
}

export function RunsView() {
  const { runs, addRun } = useApp();
  const total = runs.reduce((s, r) => s + r.km, 0);
  return (
    <div className="screen">
      <header className="screen-head row-between">
        <h1 className="screen-title">Biegi</h1>
        <button className="pill-btn" onClick={() => addRun()}>
          <Icon name="plus" size={18} /> Dodaj
        </button>
      </header>
      {runs.length === 0 ? (
        <div className="empty">
          <p>Nie masz jeszcze zapisanych biegów.</p>
          <p className="muted">Wrzuć screen aktywności ze Stravy albo wpisz dystans i czas ręcznie.</p>
          <button className="primary" onClick={() => addRun()}>
            Dodaj pierwszy bieg
          </button>
        </div>
      ) : (
        <>
          <p className="muted summary-line">
            {runs.length} {runs.length === 1 ? "bieg" : runs.length < 5 ? "biegi" : "biegów"}, razem {fmtKmShort(total)} km
          </p>
          <ul className="list">
            {runs.map((r) => (
              <RunRow key={r.id} run={r} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function RunDetail({ run, onClose }: { run: Run; onClose: () => void }) {
  const { db, user, plan, profile, runs, editRun, notify } = useApp();
  const [confirming, setConfirming] = useState(false);
  const workout = workoutOn(plan, run.date);
  const verdict = evaluateRun(run, workout, profile, runs);
  const pace = runPace(run);

  function remove() {
    deleteRun(db, user.uid, run.id).catch((e) => {
      console.error(e);
      notify("Serwer nie przyjął usunięcia biegu.");
    });
    notify("Bieg usunięty");
    onClose();
  }

  return (
    <div className="detail">
      <p className="muted">{fmtDate(run.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      <div className="stats">
        <Stat label="Dystans" value={fmtKm(run.km)} unit="km" />
        <Stat label="Tempo" value={fmtPace(pace)} unit="/km" />
        <Stat label="Czas" value={fmtDuration(run.movingSec)} />
        {run.avgHr ? <Stat label="Śr. tętno" value={run.avgHr} unit="bpm" /> : null}
        {run.elevationM !== undefined ? <Stat label="Przewyższenie" value={run.elevationM} unit="m" /> : null}
        {run.kcal ? <Stat label="Kalorie" value={run.kcal} unit="kcal" /> : null}
      </div>

      <section className={`verdict tone-${verdict.tone}`}>
        <div className="verdict-head">
          <strong>{verdict.headline}</strong>
          {workout && <TypeTag type={workout.type} />}
        </div>
        {workout && (
          <p className="muted">
            Plan: {workout.title.toLowerCase()}, {fmtKmShort(workout.km)} km
          </p>
        )}
        <ul>
          {verdict.points.map((p, i) => (
            <li key={i} className={`tone-${p.tone}`}>
              {p.text}
            </li>
          ))}
        </ul>
      </section>

      {run.splits && run.splits.length > 0 && <Splits run={run} />}

      {(run.shoe || run.effort || run.notes) && (
        <dl className="meta">
          {run.shoe && (
            <>
              <dt>Buty</dt>
              <dd>{run.shoe}</dd>
            </>
          )}
          {run.effort && (
            <>
              <dt>Odczucie</dt>
              <dd>{EFFORT_LABELS[run.effort - 1]}</dd>
            </>
          )}
          {run.notes && (
            <>
              <dt>Notatka</dt>
              <dd>{run.notes}</dd>
            </>
          )}
        </dl>
      )}

      <div className="detail-actions">
        <button className="secondary" onClick={() => editRun(run)}>
          Edytuj
        </button>
        {confirming ? (
          <button className="danger" onClick={remove}>
            Na pewno usuń
          </button>
        ) : (
          <button className="secondary" onClick={() => setConfirming(true)}>
            Usuń
          </button>
        )}
      </div>
    </div>
  );
}

export const EFFORT_LABELS = ["Bardzo lekko", "Lekko", "W sam raz", "Ciężko", "Bardzo ciężko"];

export function Splits({ run }: { run: Pick<Run, "splits"> }) {
  const splits = run.splits ?? [];
  const fastest = Math.min(...splits.map((s) => s.paceSec));
  const slowest = Math.max(...splits.map((s) => s.paceSec));
  const span = Math.max(30, slowest - fastest);
  return (
    <section className="splits">
      <h3 className="block-title">Międzyczasy</h3>
      <ol>
        {splits.map((s, i) => (
          <li key={i}>
            <span className="sp-km">{i + 1}</span>
            <span className="sp-track">
              {/* Faster kilometres draw longer bars. */}
              <span className="sp-bar" style={{ width: `${40 + ((slowest - s.paceSec) / span) * 60}%` }} />
            </span>
            <span className="sp-pace">{fmtPace(s.paceSec)}</span>
            <span className="sp-hr">{s.hr ?? "–"}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
