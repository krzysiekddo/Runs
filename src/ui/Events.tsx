import { useState } from "react";
import { addDays, fmtDate, today } from "../lib/format";
import { RACE_DISTANCES, raceLabel, recoveryDays } from "../lib/plan";
import type { PlanEvent } from "../lib/types";
import { Icon, useApp } from "./common";

export function EventsBlock({ onOpen }: { onOpen: (e: PlanEvent | null) => void }) {
  const { profile } = useApp();
  const [open, setOpen] = useState(false);
  const t = today();
  const upcoming = (profile.events ?? [])
    .filter((e) => (e.endDate ?? e.date) >= addDays(t, -14))
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="block">
      <div className="row-between">
        <button className="collapse-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {/* Inner flex wrapper: Safari does not reliably lay out a <button> itself as a flex box. */}
          <span className="collapse-inner">
            <span className={`collapse-chevron ${open ? "open" : ""}`}>
              <Icon name="chevron" size={24} />
            </span>
            <span className="collapse-title">Wydarzenia</span>
            {!open && upcoming.length > 0 && (
              <span className="collapse-meta">
                {upcoming.length}, najbliższe {fmtDate(upcoming[0].date)}
              </span>
            )}
          </span>
        </button>
        <button className="text-btn" onClick={() => onOpen(null)}>
          Dodaj
        </button>
      </div>
      {!open ? null : upcoming.length === 0 ? (
        <p className="muted small events-empty">
          Masz po drodze inny start albo wyjazd? Dodaj go, a plan ułoży się wokół niego.
        </p>
      ) : (
        <ul className="list">
          {upcoming.map((e) => (
            <li key={e.id}>
              <button className="row row-btn" onClick={() => onOpen(e)}>
                <span className={`row-bar ${e.type === "race" ? "t-race" : "t-extra"}`} />
                <div className="row-main">
                  <strong>{eventTitle(e)}</strong>
                  <span className="muted">{eventSubtitle(e)}</span>
                </div>
                <Icon name="chevron" size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function eventTitle(e: PlanEvent): string {
  if (e.type === "off") return e.title?.trim() || "Przerwa";
  return e.title?.trim() || `Start: ${raceLabel(e.km ?? 0)}`;
}

function eventSubtitle(e: PlanEvent): string {
  if (e.type === "off") {
    return e.endDate && e.endDate !== e.date ? `${fmtDate(e.date)} – ${fmtDate(e.endDate)}, bez treningów` : `${fmtDate(e.date)}, bez treningu`;
  }
  const effort = e.effort === "workout" ? "treningowo" : "na maksa";
  return `${fmtDate(e.date, { weekday: "short", day: "numeric", month: "short" })}, ${effort}, regeneracja ${recoveryDays(e)} dni`;
}

type Draft = {
  type: "race" | "off";
  date: string;
  endDate: string;
  km: number | "custom";
  customKm: string;
  title: string;
  effort: "race" | "workout";
};

export function EventEditor({ event, onDone }: { event: PlanEvent | null; onDone: () => void }) {
  const { profile, saveEvents } = useApp();
  const preset = RACE_DISTANCES.find((r) => event?.km && Math.abs(r.km - event.km) < 0.01);
  const [d, setD] = useState<Draft>({
    type: event?.type ?? "race",
    date: event?.date ?? addDays(today(), 3),
    endDate: event?.endDate ?? event?.date ?? addDays(today(), 3),
    km: event?.km ? (preset ? preset.km : "custom") : 10,
    customKm: event?.km && !preset ? String(event.km).replace(".", ",") : "",
    title: event?.title ?? "",
    effort: event?.effort ?? "race",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));

  const km = d.km === "custom" ? Number(d.customKm.replace(",", ".")) : d.km;
  const valid = d.type === "off" ? !!d.date && d.endDate >= d.date : !!d.date && km > 0 && km <= 100;
  const others = (profile.events ?? []).filter((e) => e.id !== event?.id);

  function save() {
    if (!valid) return;
    const next: PlanEvent =
      d.type === "off"
        ? { id: event?.id ?? `e-${Date.now().toString(36)}`, type: "off", date: d.date, endDate: d.endDate, title: d.title.trim() || undefined }
        : { id: event?.id ?? `e-${Date.now().toString(36)}`, type: "race", date: d.date, km, effort: d.effort, title: d.title.trim() || undefined };
    saveEvents([...others, next], event ? "Plan przeliczony" : "Wydarzenie dodane, plan przeliczony");
    onDone();
  }

  function remove() {
    saveEvents(others, "Wydarzenie usunięte, plan przeliczony");
    onDone();
  }

  return (
    <div className="add-run">
      <div className="segmented" role="radiogroup" aria-label="Rodzaj wydarzenia">
        {(["race", "off"] as const).map((t) => (
          <button key={t} role="radio" aria-checked={d.type === t} className={d.type === t ? "selected" : ""} onClick={() => set({ type: t })}>
            {t === "race" ? "Start" : "Przerwa"}
          </button>
        ))}
      </div>

      {d.type === "race" ? (
        <>
          <label className="field">
            <span className="field-label">Data startu</span>
            <input type="date" value={d.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
          <div className="field" role="group" aria-label="Dystans">
            <span className="field-label">Dystans</span>
            <div className="chips">
              {RACE_DISTANCES.map((r) => (
                <button key={r.km} className={d.km === r.km ? "selected" : ""} aria-pressed={d.km === r.km} onClick={() => set({ km: r.km })}>
                  {r.label}
                </button>
              ))}
              <button className={d.km === "custom" ? "selected" : ""} aria-pressed={d.km === "custom"} onClick={() => set({ km: "custom" })}>
                Inny
              </button>
            </div>
            {d.km === "custom" && (
              <div className="input-unit">
                <input inputMode="decimal" placeholder="np. 15" value={d.customKm} onChange={(e) => set({ customKm: e.target.value })} aria-label="Dystans w km" />
                <span>km</span>
              </div>
            )}
          </div>
          <div className="field" role="group" aria-label="Jak pobiegniesz?">
            <span className="field-label">Jak pobiegniesz?</span>
            <div className="choice-list">
              <button className={`choice ${d.effort === "race" ? "selected" : ""}`} onClick={() => set({ effort: "race" })}>
                <strong>Na maksa</strong>
                <span>Dzień przed i po bez biegania, potem kilka dni tylko spokojnie.</span>
              </button>
              <button className={`choice ${d.effort === "workout" ? "selected" : ""}`} onClick={() => set({ effort: "workout" })}>
                <strong>Treningowo</strong>
                <span>Mocny bieg zamiast treningu tempowego, krótka regeneracja.</span>
              </button>
            </div>
          </div>
          {valid && (
            <p className="muted small">
              Regeneracja: {recoveryDays({ id: "", type: "race", date: d.date, km, effort: d.effort })} dni spokojnego biegania po starcie.
            </p>
          )}
        </>
      ) : (
        <div className="form-grid">
          <label className="field">
            <span className="field-label">Od</span>
            <input type="date" value={d.date} onChange={(e) => set({ date: e.target.value, endDate: e.target.value > d.endDate ? e.target.value : d.endDate })} />
          </label>
          <label className="field">
            <span className="field-label">Do</span>
            <input type="date" value={d.endDate} min={d.date} onChange={(e) => set({ endDate: e.target.value })} />
          </label>
        </div>
      )}

      <label className="field">
        <span className="field-label">Nazwa</span>
        <input
          placeholder={d.type === "race" ? "np. Bieg Niepodległości" : "np. Wyjazd w góry"}
          value={d.title}
          onChange={(e) => set({ title: e.target.value })}
        />
      </label>

      <button className="primary block-btn" disabled={!valid} onClick={save}>
        {event ? "Zapisz zmiany" : "Dodaj do planu"}
      </button>

      {event &&
        (confirmDelete ? (
          <button className="danger block-btn" onClick={remove}>
            Na pewno usuń
          </button>
        ) : (
          <button className="text-btn danger-text" onClick={() => setConfirmDelete(true)}>
            Usuń wydarzenie
          </button>
        ))}
    </div>
  );
}
