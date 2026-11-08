import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, signInWithPopup, type Auth, type User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { auth, db, googleProvider } from "./firebase";
import { saveProfile, useUserData } from "./lib/store";
import type { Plan, Profile, Run } from "./lib/types";
import { AddRun } from "./ui/AddRun";
import { AppCtx, Icon, Sheet } from "./ui/common";
import { Onboarding } from "./ui/Onboarding";
import { PlanView } from "./ui/PlanView";
import { Progress } from "./ui/Progress";
import { RunDetail, RunsView } from "./ui/Runs";
import { Today } from "./ui/Today";

const IGNORED_ERRORS = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];

const ERROR_MESSAGES: Record<string, string> = {
  "auth/popup-blocked": "Przeglądarka zablokowała okno logowania. Zezwól na wyskakujące okna i spróbuj ponownie.",
  "auth/unauthorized-domain": "Ta domena nie jest dodana w Firebase: Authentication > Settings > Authorized domains.",
  "auth/operation-not-allowed": "Logowanie Google nie jest włączone w Firebase: Authentication > Sign-in method.",
  "auth/configuration-not-found": "Authentication nie jest jeszcze włączone w tym projekcie Firebase.",
  "auth/network-request-failed": "Brak połączenia. Sprawdź internet i spróbuj ponownie.",
};

export function App() {
  if (!auth || !db) {
    return (
      <main className="center-screen">
        <p className="brand">Runs</p>
        <p className="muted">
          Brakuje konfiguracji Firebase. Skopiuj <code>.env.example</code> do <code>.env</code>, uzupełnij wartości i uruchom
          aplikację ponownie.
        </p>
      </main>
    );
  }
  return <AuthGate auth={auth} db={db} />;
}

function AuthGate({ auth, db }: { auth: Auth; db: Firestore }) {
  // undefined = Firebase has not restored the session yet
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), [auth]);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      const code = e instanceof FirebaseError ? e.code : "";
      if (!IGNORED_ERRORS.includes(code)) {
        console.error(e);
        setError(ERROR_MESSAGES[code] ?? "Logowanie się nie udało. Spróbuj ponownie.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) return <Loading />;
  if (user) return <Home db={db} user={user} />;

  return (
    <main className="center-screen login">
      <p className="brand">Runs</p>
      <h1>Plan biegowy, który dopasowuje się do Twoich treningów.</h1>
      <p className="muted">Odpowiesz na kilka pytań, a potem po każdym biegu wrzucisz screen ze Stravy.</p>
      <button className="primary" disabled={busy} onClick={signIn}>
        Zaloguj się przez Google
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

function Loading() {
  return (
    <main className="center-screen">
      <p className="brand pulse">Runs</p>
    </main>
  );
}

type Tab = "today" | "plan" | "runs" | "progress";
type Overlay = { kind: "add"; date?: string } | { kind: "edit"; run: Run } | { kind: "run"; run: Run } | null;

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Dziś" },
  { id: "plan", label: "Plan" },
  { id: "runs", label: "Biegi" },
  { id: "progress", label: "Postępy" },
];

function Home({ db, user }: { db: Firestore; user: User }) {
  const data = useUserData(db, user.uid);
  const [tab, setTab] = useState<Tab>("today");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const close = useCallback(() => setOverlay(null), []);

  async function onPlan(profile: Profile, plan: Plan) {
    await saveProfile(db, user.uid, profile, plan);
    setEditingProfile(false);
    setTab("today");
  }

  if (data.error) {
    return (
      <main className="center-screen">
        <p className="brand">Runs</p>
        <p className="error">{data.error}</p>
      </main>
    );
  }
  if (data.loading) return <Loading />;
  if (!data.profile || !data.plan || editingProfile) {
    return (
      <Onboarding
        initial={data.profile}
        onDone={onPlan}
        onCancel={data.profile && data.plan ? () => setEditingProfile(false) : undefined}
      />
    );
  }

  // Keep the sheet showing the latest saved version of the run.
  const liveRun = overlay && overlay.kind === "run" ? (data.runs.find((r) => r.id === overlay.run.id) ?? overlay.run) : null;

  return (
    <AppCtx.Provider
      value={{
        db,
        user,
        profile: data.profile,
        plan: data.plan,
        runs: data.runs,
        addRun: (date) => setOverlay({ kind: "add", date }),
        editRun: (run) => setOverlay({ kind: "edit", run }),
        openRun: (run) => setOverlay({ kind: "run", run }),
        editProfile: () => setEditingProfile(true),
      }}
    >
      <div className="app">
        <main className="content">
          {tab === "today" && <Today />}
          {tab === "plan" && <PlanView />}
          {tab === "runs" && <RunsView />}
          {tab === "progress" && <Progress />}
        </main>

        <nav className="tabbar" aria-label="Nawigacja">
          {TABS.slice(0, 2).map((t) => (
            <TabButton key={t.id} tab={t} active={tab === t.id} onClick={() => setTab(t.id)} />
          ))}
          <button className="tab-add" onClick={() => setOverlay({ kind: "add" })} aria-label="Dodaj bieg">
            <Icon name="plus" size={26} />
          </button>
          {TABS.slice(2).map((t) => (
            <TabButton key={t.id} tab={t} active={tab === t.id} onClick={() => setTab(t.id)} />
          ))}
        </nav>

        {overlay?.kind === "add" && (
          <Sheet title="Nowy bieg" onClose={close}>
            <AddRun date={overlay.date} onDone={close} />
          </Sheet>
        )}
        {overlay?.kind === "edit" && (
          <Sheet title="Edytuj bieg" onClose={close}>
            <AddRun run={overlay.run} onDone={close} />
          </Sheet>
        )}
        {liveRun && (
          <Sheet title={liveRun.title || "Bieg"} onClose={close}>
            <RunDetail run={liveRun} onClose={close} />
          </Sheet>
        )}
      </div>
    </AppCtx.Provider>
  );
}

function TabButton({ tab, active, onClick }: { tab: { id: Tab; label: string }; active: boolean; onClick: () => void }) {
  return (
    <button className={`tab ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      <Icon name={tab.id} />
      <span>{tab.label}</span>
    </button>
  );
}
