import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// getAuth() throws on a missing API key, so stay null until .env is filled in.
export const auth = Object.values(firebaseConfig).every(Boolean)
  ? getAuth(initializeApp(firebaseConfig))
  : null;

export const googleProvider = new GoogleAuthProvider();
