import { useMemo, useState } from "react";
import { fmtDuration, fmtPace, parseDuration, today } from "../lib/format";
import { readScreenshots } from "../lib/ocr";
import { saveRun } from "../lib/store";
import type { Run, Split } from "../lib/types";
import { Icon, useApp } from "./common";
import { EFFORT_LABELS, Splits } from "./Runs";

type Form = {
  date: string;
  km: string;
  time: string;
  avgHr: string;
  elevationM: string;
  kcal: string;
  shoe: string;
  title: string;
  effort: number;
  notes: string;
  splits: Split[];
};

const numText = (n?: number) => (n === undefined ? "" : String(n).replace(".", ","));
const parseNum = (s: string) => {
  const n = Number(s.replace(",", ".").trim());
  return s.trim() && Number.isFinite(n) ? n : undefined;
};

function toForm(run?: Run, date?: string): Form {
  return {
    date: run?.date ?? date ?? today(),
    km: numText(run?.km),
    time: run ? fmtDuration(run.movingSec) : "",
    avgHr: numText(run?.avgHr),
    elevationM: numText(run?.elevationM),
    kcal: numText(run?.kcal),
    shoe: run?.shoe ?? "",
    title: run?.title ?? "",
    effort: run?.effort ?? 0,
    notes: run?.notes ?? "",
    splits: run?.splits ?? [],
  };
}

export function AddRun({ run, date, onDone }: { run?: Run; date?: string; onDone: () => void }) {
  const { db, user, runs } = useApp();
  const [f, setF] = useState<Form>(() => toForm(run, date));
  const [ocr, setOcr] = useState<{ busy: boolean; label: string; progress: number; message?: string; error?: string }>({
    busy: false,
    label: "",
    progress: 0,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));

  const shoes = useMemo(() => [...new Set(runs.map((r) => r.shoe).filter(Boolean))] as string[], [runs]);
  const km = parseNum(f.km);
  const sec = parseDuration(f.time);
  const pace = km && sec ? sec / km : undefined;
  const valid = !!km && km > 0 && km < 300 && !!sec && !!pace && pace > 120 && pace < 1200 && !!f.date;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setOcr({ busy: true, label: "Ładuję…", progress: 0 });
    try {
      const p = await readScreenshots([...files], (progress, label) => setOcr((o) => ({ ...o, progress, label })));
      const found = [p.km, p.movingSec, p.avgHr, p.splits?.length].filter(Boolean).length;
      setF((x) => ({
        ...x,
        date: p.date ?? x.date,
        km: p.km !== undefined ? numText(p.km) : x.km,
        time: p.movingSec !== undefined ? fmtDuration(p.movingSec) : x.time,
        avgHr: p.avgHr !== undefined ? String(p.avgHr) : x.avgHr,
        elevationM: p.elevationM !== undefined ? String(p.elevationM) : x.elevationM,
        kcal: p.kcal !== undefined ? String(p.kcal) : x.kcal,
        shoe: p.shoe ?? x.shoe,
        title: p.title ?? x.title,
        splits: p.splits ?? x.splits,
      }));
      setOcr({
        busy: false,
        label: "",
        progress: 1,
        message: found
          ? `Odczytano dane${p.splits?.length ? ` i ${p.splits.length} międzyczasów` : ""}. Sprawdź je przed zapisem.`
          : undefined,
        error: found ? undefined : "Nie znalazłem danych biegu na tym screenie. Wrzuć widok aktywności ze Stravy albo wpisz dane ręcznie.",
      });
    } catch (e) {
      console.error(e);
      setOcr({ busy: false, label: "", progress: 0, error: e instanceof Error ? e.message : "Odczyt się nie udał." });
    }
  }

  async function save() {
    if (!valid) return;
    setSaving(true);
    setError(null);
    const record: Run = {
      id: run?.id ?? `${f.date}-${Date.now().toString(36)}`,
      date: f.date,
      km: km!,
      movingSec: sec!,
      avgHr: parseNum(f.avgHr),
      elevationM: parseNum(f.elevationM),
      kcal: parseNum(f.kcal),
      shoe: f.shoe.trim() || undefined,
      title: f.title.trim() || undefined,
      effort: f.effort || undefined,
      notes: f.notes.trim() || undefined,
      splits: f.splits.length ? f.splits : undefined,
      createdAt: run?.createdAt ?? new Date().toISOString(),
    };
    try {
      await saveRun(db, user.uid, record);
      onDone();
    } catch (e) {
      console.error(e);
      setError("Nie udało się zapisać biegu. Sprawdź połączenie i spróbuj ponownie.");
      setSaving(false);
    }
  }

  return (
    <div className="add-run">
      {!run && (
        <label className={`drop ${ocr.busy ? "busy" : ""}`}>
          <input type="file" accept="image/*" multiple disabled={ocr.busy} onChange={(e) => onFiles(e.target.files)} />
          <Icon name="camera" size={26} />
          {ocr.busy ? (
            <>
              <strong>{ocr.label}</strong>
              <span className="progress">
                <span style={{ width: `${Math.round(ocr.progress * 100)}%` }} />
              </span>
            </>
          ) : (
            <>
              <strong>Wrzuć screeny ze Stravy</strong>
              <span className="muted">Widok aktywności i opcjonalnie międzyczasy. Obraz zostaje na telefonie.</span>
            </>
          )}
        </label>
      )}
      {ocr.message && <p className="notice good">{ocr.message}</p>}
      {ocr.error && <p className="notice warn">{ocr.error}</p>}

      <div className="form-grid">
        <label className="field">
          <span className="field-label">Data</span>
          <input type="date" value={f.date} max={today()} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Dystans</span>
          <div className="input-unit">
            <input inputMode="decimal" placeholder="7,02" value={f.km} onChange={(e) => set({ km: e.target.value })} />
            <span>km</span>
          </div>
        </label>
        <label className="field">
          <span className="field-label">Czas ruchu</span>
          <input inputMode="numeric" placeholder="45:02" value={f.time} onChange={(e) => set({ time: e.target.value })} />
        </label>
        <div className="field">
          <span className="field-label">Tempo</span>
          <output className="computed">{pace ? `${fmtPace(pace)} /km` : "–"}</output>
        </div>
        <label className="field">
          <span className="field-label">Średnie tętno</span>
          <div className="input-unit">
            <input inputMode="numeric" placeholder="opcjonalnie" value={f.avgHr} onChange={(e) => set({ avgHr: e.target.value })} />
            <span>bpm</span>
          </div>
        </label>
        <label className="field">
          <span className="field-label">Przewyższenie</span>
          <div className="input-unit">
            <input inputMode="numeric" placeholder="opcjonalnie" value={f.elevationM} onChange={(e) => set({ elevationM: e.target.value })} />
            <span>m</span>
          </div>
        </label>
        <label className="field span-2">
          <span className="field-label">Buty</span>
          <input list="shoe-list" placeholder="np. ASICS Nimbus 27" value={f.shoe} onChange={(e) => set({ shoe: e.target.value })} />
          <datalist id="shoe-list">
            {shoes.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="field" role="group" aria-label="Jak się biegło?">
        <span className="field-label">Jak się biegło?</span>
        <div className="effort">
          {EFFORT_LABELS.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-pressed={f.effort === i + 1}
              className={f.effort === i + 1 ? "selected" : ""}
              onClick={() => set({ effort: f.effort === i + 1 ? 0 : i + 1 })}
            >
              <span className="effort-n">{i + 1}</span>
              <span className="effort-l">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field-label">Notatka</span>
        <textarea rows={2} placeholder="Jak się czułeś, co bolało, pogoda…" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
      </label>

      {f.splits.length > 0 && (
        <div className="splits-preview">
          <Splits run={f} />
          <button className="text-btn" onClick={() => set({ splits: [] })}>
            Usuń międzyczasy
          </button>
        </div>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="primary block-btn" disabled={!valid || saving || ocr.busy} onClick={save}>
        {saving ? "Zapisuję…" : run ? "Zapisz zmiany" : "Zapisz bieg"}
      </button>
    </div>
  );
}
