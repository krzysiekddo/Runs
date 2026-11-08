import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
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
};

function describe(e: unknown): string {
  const code = (e as { code?: string })?.code ?? "";
  if (code === "permission-denied")
    return "Brak dostępu do bazy. Sprawdź reguły Firestore (plik firestore.rules w repo).";
  if (code === "failed-precondition" || code === "not-found")
    return "Baza Firestore nie jest jeszcze utworzona w projekcie Firebase.";
  return "Nie udało się połączyć z bazą danych.";
}

export function useUserData(db: Firestore, uid: string): UserData {
  const [state, setState] = useState<UserData>({ loading: true, error: null, profile: null, plan: null, runs: [] });

  useEffect(() => {
    let userLoaded = false;
    let runsLoaded = false;
    const fail = (e: unknown) => {
      console.error(e);
      setState((s) => ({ ...s, loading: false, error: describe(e) }));
    };
    const unsubUser = onSnapshot(
      doc(db, "users", uid),
      (snap) => {
        userLoaded = true;
        const data = snap.data() as { profile?: Profile; plan?: Plan } | undefined;
        setState((s) => ({ ...s, loading: !runsLoaded, profile: data?.profile ?? null, plan: data?.plan ?? null }));
      },
      fail,
    );
    const unsubRuns = onSnapshot(
      query(collection(db, "users", uid, "runs"), orderBy("date", "desc")),
      (snap) => {
        runsLoaded = true;
        const runs = snap.docs.map((d) => ({ ...(d.data() as Run), id: d.id }));
        setState((s) => ({ ...s, loading: !userLoaded, runs }));
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

export function saveProfile(db: Firestore, uid: string, profile: Profile, plan: Plan) {
  return setDoc(doc(db, "users", uid), { profile, plan });
}

export function saveRun(db: Firestore, uid: string, run: Run) {
  return setDoc(doc(db, "users", uid, "runs", run.id), run);
}

export function deleteRun(db: Firestore, uid: string, id: string) {
  return deleteDoc(doc(db, "users", uid, "runs", id));
}
