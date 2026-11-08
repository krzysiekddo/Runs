import { FirebaseError } from "firebase/app";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { auth, googleProvider } from "./firebase";

const IGNORED_ERRORS = ["auth/popup-closed-by-user", "auth/cancelled-popup-request"];

const ERROR_MESSAGES: Record<string, string> = {
  "auth/popup-blocked": "Przeglądarka zablokowała okno logowania. Zezwól na wyskakujące okna i spróbuj ponownie.",
  "auth/unauthorized-domain": "Ta domena nie jest dodana w Firebase: Authentication > Settings > Authorized domains.",
  "auth/operation-not-allowed": "Logowanie Google nie jest włączone w Firebase: Authentication > Sign-in method.",
  "auth/configuration-not-found": "Authentication nie jest jeszcze włączone w tym projekcie Firebase.",
  "auth/network-request-failed": "Brak połączenia. Sprawdź internet i spróbuj ponownie.",
};

export function App() {
  if (!auth) {
    return (
      <main className="card">
        <h1>Runs</h1>
        <p>
          Brakuje konfiguracji Firebase. Skopiuj <code>.env.example</code> do <code>.env</code>, uzupełnij
          wartości i uruchom aplikację ponownie.
        </p>
      </main>
    );
  }
  return <AuthGate auth={auth} />;
}

function AuthGate({ auth }: { auth: Auth }) {
  // undefined = Firebase has not restored the session yet
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, setUser), [auth]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      const code = e instanceof FirebaseError ? e.code : "";
      if (!IGNORED_ERRORS.includes(code)) {
        console.error(e);
        setError(ERROR_MESSAGES[code] ?? "Coś poszło nie tak. Spróbuj ponownie.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined) {
    return (
      <main className="card">
        <p>Ładowanie…</p>
      </main>
    );
  }

  return (
    <main className="card">
      <h1>Runs</h1>
      {user ? (
        <>
          {user.photoURL && (
            <img className="avatar" src={user.photoURL} alt="" referrerPolicy="no-referrer" />
          )}
          <p>
            Zalogowano jako <strong>{user.displayName ?? user.email}</strong>
          </p>
          <button disabled={busy} onClick={() => run(() => signOut(auth))}>
            Wyloguj się
          </button>
        </>
      ) : (
        <button disabled={busy} onClick={() => run(() => signInWithPopup(auth, googleProvider))}>
          Zaloguj się przez Google
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
