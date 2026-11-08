import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import type { Plan, Profile, Run } from "./types";

export type UserData = {
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  plan: Plan | null;
  runs: Run[];
  /** Local changes the server has not confirmed yet. */
  pendingWrites: boolean;
};

function describe(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  const message = (e as { message?: string })?.message ?? "";
  if (code === "permission-denied")
    return "Serwer odrzucił dostęp. Wklej reguły z pliku firestore.rules w Firebase: Firestore Database > Rules > Publish.";
  if (code === "not-found" || /does not exist/i.test(message))
    return "Baza Firestore nie istnieje. Utwórz ją w Firebase: Firestore Database > Create database.";
  if (code === "unavailable" || code === "deadline-exceeded" || code === "timeout")
    return "Brak połączenia z bazą Firestore. Jeśli internet działa, sprawdź w Firebase, czy baza Firestore jest utworzona.";
  return `Błąd bazy danych${code ? ` (${code})` : ""}.`;
}

export function useUserData(db: Firestore, uid: string): UserData {
  const [state, setState] = useState<UserData>({
    loading: true,
    error: null,
    profile: null,
    plan: null,
    runs: [],
    pendingWrites: false,
  });

  useEffect(() => {
    let userPending = false;
    let runsPending = false;
    const fail = (e: unknown) => {
      console.error(e);
      setState((s) => ({ ...s, loading: false, error: describe(e) }));
    };
    // The app renders as soon as the profile is known; runs stream in when ready.
    const unsubUser = onSnapshot(
      doc(db, "users", uid),
      { includeMetadataChanges: true },
      (snap) => {
        userPending = snap.metadata.hasPendingWrites;
        const data = snap.data() as { profile?: Profile; plan?: Plan } | undefined;
        setState((s) => ({
          ...s,
          loading: false,
          profile: data?.profile ?? null,
          plan: data?.plan ?? null,
          pendingWrites: userPending || runsPending,
        }));
      },
      fail,
    );
    const unsubRuns = onSnapshot(
      query(collection(db, "users", uid, "runs"), orderBy("date", "desc")),
      { includeMetadataChanges: true },
      (snap) => {
        runsPending = snap.metadata.hasPendingWrites;
        const runs = snap.docs.map((d) => ({ ...(d.data() as Run), id: d.id }));
        setState((s) => ({ ...s, runs, pendingWrites: userPending || runsPending }));
      },
      fail,
    );
    return () => {
      unsubUser();
      unsubRuns();
    };
  }, [db, uid]);

  return state;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(Object.assign(new Error("timeout"), { code: "timeout" })), ms)),
  ]);
}

/** Asks the server directly, so a missing database or wrong rules show up as a clear message. */
export function useServerStatus(db: Firestore, uid: string, recheck: unknown): string | null {
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    withTimeout(getDocFromServer(doc(db, "users", uid)), 12_000).then(
      () => alive && setProblem(null),
      (e) => {
        console.error(e);
        if (alive) setProblem(describe(e));
      },
    );
    return () => {
      alive = false;
    };
  }, [db, uid, recheck]);
  return problem;
}

// Writes are applied to the local cache immediately and the UI updates from it,
// so callers do not wait for the server; errors are reported through the returned promise.
export function saveProfile(db: Firestore, uid: string, profile: Profile, plan: Plan) {
  return setDoc(doc(db, "users", uid), { profile, plan });
}

export function saveRun(db: Firestore, uid: string, run: Run) {
  return setDoc(doc(db, "users", uid, "runs", run.id), run);
}

export function deleteRun(db: Firestore, uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "runs", id));
}

/** Removes the profile, plan and every run of this user. */
export async function deleteAllData(db: Firestore, uid: string) {
  const runs = await getDocs(collection(db, "users", uid, "runs"));
  const batch = writeBatch(db);
  runs.forEach((r) => batch.delete(r.ref));
  batch.delete(doc(db, "users", uid));
  return batch.commit();
}
