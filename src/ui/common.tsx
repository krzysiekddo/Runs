import type { User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { WORKOUT_LABEL } from "../lib/plan";
import type { Plan, Profile, Run, WorkoutType } from "../lib/types";

export type AppState = {
  db: Firestore;
  user: User;
  profile: Profile;
  plan: Plan;
  runs: Run[];
  addRun: (date?: string) => void;
  editRun: (run: Run) => void;
  openRun: (run: Run) => void;
  editProfile: () => void;
};

export const AppCtx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("AppCtx missing");
  return ctx;
}

export function TypeTag({ type }: { type: WorkoutType }) {
  return <span className={`tag t-${type}`}>{WORKOUT_LABEL[type]}</span>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Zamknij">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}

const PATHS: Record<string, string> = {
  today: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
  plan: "M4 6h16M4 12h16M4 18h10",
  runs: "M3 12h4l3-8 4 16 3-8h4",
  progress: "M4 19h16M7 16v-5m5 5V7m5 9v-8",
  plus: "M12 5v14M5 12h14",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5 10 17l9-10",
  camera: "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
};

export function Icon({ name, size = 22 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Stat({ label, value, unit }: { label: string; value: ReactNode; unit?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <small>{unit}</small>}
      </span>
    </div>
  );
}
