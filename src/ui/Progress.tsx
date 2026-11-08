import { signOut } from "firebase/auth";
import { effectiveHrMax } from "../lib/analysis";
import { addDays, fmtDate, fmtDuration, fmtKmShort, fmtPace, mondayOf, today } from "../lib/format";
import { computeVdot, RACE_DISTANCES } from "../lib/plan";
import { hrZones, predictTime, trainingPaces } from "../lib/vdot";
import { auth } from "../firebase";
import { useApp } from "./common";

const SHOE_LIFE_KM = 700;

export function Progress() {
  const { plan, profile, runs, editProfile, user } = useApp();
  const vdot = computeVdot(profile);
  const paces = trainingPaces(vdot);
  const hr = effectiveHrMax(profile, runs);
  const zones = hr.value ? hrZones(hr.value, profile.hrRest) : undefined;

  const thisMonday = mondayOf(today());
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = addDays(thisMonday, (i - 7) * 7);
    const end = addDays(start, 6);
    const km = runs.filter((r) => r.date >= start && r.date <= end).reduce((s, r) => s + r.km, 0);
    const planned = plan.weeks.find((w) => w.start === start)?.km;
    return { start, km, planned };
  });
  const maxKm = Math.max(1, ...weeks.map((w) => Math.max(w.km, w.planned ?? 0)));

  const shoes = new Map<string, number>();
  for (const r of runs) if (r.shoe) shoes.set(r.shoe, (shoes.get(r.shoe) ?? 0) + r.km);

  return (
    <div className="screen">
      <header className="screen-head">
        <h1 className="screen-title">Postępy</h1>
      </header>

      <section className="block">
        <h2 className="block-title">Prognozy wyników</h2>
        <p className="muted small">Z wyniku {fmtKmShort(profile.recent.km)} km w {fmtDuration(profile.recent.sec)} (VDOT {vdot.toFixed(1)}).</p>
        <div className="predictions">
          {RACE_DISTANCES.map((r) => (
            <div key={r.km} className="prediction">
              <span>{r.label}</span>
              <strong>{fmtDuration(predictTime(vdot, r.km))}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="block">
        <h2 className="block-title">Kilometraż</h2>
        <div className="km-chart" role="img" aria-label="Kilometry w ostatnich 8 tygodniach">
          {weeks.map((w) => (
            <div key={w.start} className="kc-col">
              <span className="kc-val">{w.km ? Math.round(w.km) : ""}</span>
              <div className="kc-track">
                {w.planned ? <span className="kc-plan" style={{ height: `${(w.planned / maxKm) * 100}%` }} /> : null}
                <span className="kc-bar" style={{ height: `${(w.km / maxKm) * 100}%` }} />
              </div>
              <span className="kc-label">{fmtDate(w.start, { day: "numeric", month: "numeric" })}</span>
            </div>
          ))}
        </div>
        <p className="muted small">Kontur pokazuje kilometraż z planu.</p>
      </section>

      <section className="block">
        <h2 className="block-title">Tempa treningowe</h2>
        <dl className="kv">
          <dt>Spokojne</dt>
          <dd>
            {fmtPace(paces.easy.fast)}–{fmtPace(paces.easy.slow)} /km
          </dd>
          <dt>Maratońskie</dt>
          <dd>{fmtPace((paces.marathon.fast + paces.marathon.slow) / 2)} /km</dd>
          <dt>Progowe</dt>
          <dd>{fmtPace((paces.threshold.fast + paces.threshold.slow) / 2)} /km</dd>
          <dt>Interwałowe</dt>
          <dd>{fmtPace((paces.interval.fast + paces.interval.slow) / 2)} /km</dd>
        </dl>
      </section>

      <section className="block">
        <h2 className="block-title">Strefy tętna</h2>
        {zones ? (
          <>
            <dl className="kv">
              <dt>Spokojnie</dt>
              <dd>do {zones.easyMax} bpm</dd>
              <dt>Próg</dt>
              <dd>
                {zones.thresholdLow}–{zones.thresholdHigh} bpm
              </dd>
              <dt>Tętno maks.</dt>
              <dd>
                {hr.value} bpm{hr.estimated ? " (szacunek)" : ""}
              </dd>
            </dl>
            {hr.estimated && (
              <p className="muted small">Szacunek z najwyższego tętna w Twoich międzyczasach. Wpisz prawdziwe tętno maks. w ustawieniach planu.</p>
            )}
          </>
        ) : (
          <p className="muted small">Podaj tętno maksymalne w ustawieniach planu albo dodaj bieg z międzyczasami, żeby zobaczyć strefy.</p>
        )}
      </section>

      {shoes.size > 0 && (
        <section className="block">
          <h2 className="block-title">Buty</h2>
          <ul className="shoes">
            {[...shoes.entries()].sort((a, b) => b[1] - a[1]).map(([name, km]) => (
              <li key={name}>
                <div className="row-between">
                  <span>{name}</span>
                  <span className={km > SHOE_LIFE_KM ? "warn-text" : "muted"}>
                    {Math.round(km)} / {SHOE_LIFE_KM} km
                  </span>
                </div>
                <span className="progress">
                  <span style={{ width: `${Math.min(100, (km / SHOE_LIFE_KM) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="block settings">
        <button className="secondary block-btn" onClick={editProfile}>
          Zmień cel i przelicz plan
        </button>
        <p className="muted small">
          Zalogowano jako {user.displayName ?? user.email}.{" "}
          <button className="text-btn inline" onClick={() => auth && signOut(auth)}>
            Wyloguj
          </button>
        </p>
      </section>
    </div>
  );
}
