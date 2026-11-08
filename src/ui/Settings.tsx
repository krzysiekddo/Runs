import { signOut } from "firebase/auth";
import { useState } from "react";
import { auth } from "../firebase";
import { ACCENTS, type Settings, type ThemeChoice } from "../lib/settings";
import { deleteAllData } from "../lib/store";
import { Icon, useApp } from "./common";

const THEMES: { id: ThemeChoice; label: string }[] = [
  { id: "system", label: "Systemowy" },
  { id: "light", label: "Jasny" },
  { id: "dark", label: "Ciemny" },
];

export function SettingsPanel({
  settings,
  update,
  onClose,
}: {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  onClose: () => void;
}) {
  const { db, user, runs, editProfile, notify } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const dark = document.documentElement.dataset.theme === "dark" ||
    (!document.documentElement.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div className="settings-panel">
      <div className="field" role="group" aria-label="Motyw">
        <span className="field-label">Motyw</span>
        <div className="segmented three" role="radiogroup">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={settings.theme === t.id} className={settings.theme === t.id ? "selected" : ""} onClick={() => update({ theme: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="field" role="group" aria-label="Kolor akcentu">
        <span className="field-label">Kolor akcentu</span>
        <div className="swatches" role="radiogroup">
          {ACCENTS.map((a) => {
            const on = settings.accent === a.id;
            return (
              <button
                key={a.id}
                role="radio"
                aria-checked={on}
                className={`swatch ${on ? "selected" : ""}`}
                onClick={() => update({ accent: a.id })}
              >
                <span className="swatch-dot" style={{ background: dark ? a.dark : a.light }}>
                  {on && <Icon name="check" size={16} />}
                </span>
                <span className="swatch-name">{a.name}</span>
              </button>
            );
          })}
        </div>
        <span className="field-hint">Kolor przycisków i zaznaczeń. Ustawienia wyglądu zapisują się na tym urządzeniu.</span>
      </div>

      <div className="settings-group">
        <button
          className="secondary block-btn"
          onClick={() => {
            onClose();
            editProfile();
          }}
        >
          Zmień cel i dane
        </button>

        {confirmReset ? (
          <div className="reset-confirm">
            <p>Usunąć profil, plan i wszystkie biegi ({runs.length})? Tego nie da się cofnąć.</p>
            <div className="detail-actions">
              <button className="secondary" onClick={() => setConfirmReset(false)}>
                Anuluj
              </button>
              <button
                className="danger"
                onClick={() => {
                  deleteAllData(db, user.uid).catch((e) => {
                    console.error(e);
                    notify("Nie udało się usunąć danych z serwera.");
                  });
                  onClose();
                }}
              >
                Usuń wszystko
              </button>
            </div>
          </div>
        ) : (
          <button className="text-btn danger-text" onClick={() => setConfirmReset(true)}>
            Usuń moje dane i zacznij od nowa
          </button>
        )}
      </div>

      <p className="muted small settings-account">
        Zalogowano jako {user.displayName ?? user.email}.{" "}
        <button className="text-btn inline" onClick={() => auth && signOut(auth)}>
          Wyloguj
        </button>
      </p>
    </div>
  );
}
