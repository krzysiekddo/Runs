import { effectiveHrMax } from "../lib/analysis";
import { addDays, fmtDate, fmtDuration, fmtKmShort, fmtPace, mondayOf, today } from "../lib/format";
import { RACE_DISTANCES } from "../lib/plan";
import { hrZones, predictTime, trainingPaces } from "../lib/vdot";
import { useState } from "react";
import { removeShoe, SHOE_LIFE_KM, shoeMileage, upsertShoe, type ShoeMileage } from "../lib/shoes";
import { SettingsButton, Sheet, useApp } from "./common";


export function Progress() {
  const { plan, profile, runs } = useApp();
  const vdot = plan.vdot;
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

  const shoes = shoeMileage(runs, profile.shoes);
  // undefined = closed, null = new pair
  const [editingShoe, setEditingShoe] = useState<ShoeMileage | null | undefined>(undefined);

  return (
    <div className="screen">
      <header className="screen-head row-between">
        <h1 className="screen-title">Postępy</h1>
        <SettingsButton />
      </header>

      <section className="block">
        <h2 className="block-title">Prognozy wyników</h2>
        <p className="muted small">
          Według aktualnej formy (VDOT {vdot.toFixed(1)}): wynik {fmtKmShort(profile.recent.km)} km w {fmtDuration(profile.recent.sec)},
          postęp zakładany w planie{plan.adjustment ? " i Twoje ostatnie biegi" : ""}.
        </p>
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
              <p className="muted small">Szacunek z najwyższego tętna w Twoich międzyczasach. Wpisz prawdziwe tętno maks. w ustawieniach (zębatka → Zmień cel i dane).</p>
            )}
          </>
        ) : (
          <p className="muted small">Podaj tętno maksymalne w ustawieniach (zębatka → Zmień cel i dane) albo dodaj bieg z międzyczasami, żeby zobaczyć strefy.</p>
        )}
      </section>

      <section className="block">
        <div className="row-between">
          <h2 className="block-title">Buty</h2>
          <button className="text-btn" onClick={() => setEditingShoe(null)}>
            Dodaj
          </button>
        </div>
        {shoes.length === 0 ? (
          <p className="muted small events-empty">Buty pojawią się tu, gdy dodasz je do biegu. Możesz też dodać parę ręcznie z aktualnym przebiegiem.</p>
        ) : (
          <ul className="list">
            {shoes.map((s) => (
              <li key={s.name}>
                <button className="shoe-row" onClick={() => setEditingShoe(s)}>
                  <span className="row-between">
                    <strong>{s.name}</strong>
                    <span className={s.km > SHOE_LIFE_KM ? "warn-text" : "muted"}>
                      {Math.round(s.km)} / {SHOE_LIFE_KM} km
                    </span>
                  </span>
                  <span className="progress">
                    <span style={{ width: `${Math.min(100, (s.km / SHOE_LIFE_KM) * 100)}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {editingShoe !== undefined && (
        <Sheet title={editingShoe ? editingShoe.name : "Nowe buty"} onClose={() => setEditingShoe(undefined)}>
          <ShoeEditor shoe={editingShoe} onDone={() => setEditingShoe(undefined)} />
        </Sheet>
      )}

    </div>
  );
}

function ShoeEditor({ shoe, onDone }: { shoe: ShoeMileage | null; onDone: () => void }) {
  const { profile, updateProfile } = useApp();
  const [name, setName] = useState(shoe?.name ?? "");
  const [km, setKm] = useState(shoe ? String(Math.round(shoe.km)) : "");
  const value = Number(km.replace(",", "."));
  const valid = name.trim().length > 0 && km.trim() !== "" && Number.isFinite(value) && value >= 0 && value < 10_000;

  return (
    <div className="add-run">
      {!shoe && (
        <label className="field">
          <span className="field-label">Model</span>
          <input placeholder="np. ASICS Nimbus 27" value={name} onChange={(e) => setName(e.target.value)} />
          <span className="field-hint">Wpisz tak samo jak w biegach, żeby kilometry się sumowały.</span>
        </label>
      )}
      <label className="field">
        <span className="field-label">Aktualny przebieg</span>
        <div className="input-unit">
          <input inputMode="decimal" placeholder="np. 200" value={km} onChange={(e) => setKm(e.target.value)} autoFocus />
          <span>km</span>
        </div>
        <span className="field-hint">Każdy bieg dodany od teraz w tych butach doliczy się do tej wartości.</span>
      </label>
      <button
        className="primary block-btn"
        disabled={!valid}
        onClick={() => {
          updateProfile({ shoes: upsertShoe(profile.shoes, name, value) }, "Przebieg butów zapisany");
          onDone();
        }}
      >
        Zapisz przebieg
      </button>
      {shoe?.manual && (
        <button
          className="text-btn"
          onClick={() => {
            updateProfile({ shoes: removeShoe(profile.shoes, shoe.name) }, "Przebieg liczony z biegów");
            onDone();
          }}
        >
          Licz przebieg tylko z zapisanych biegów
        </button>
      )}
    </div>
  );
}
