"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { connectAuthEmulator, getAuth, signInAnonymously } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
export const firebaseConfigured = !!(config.apiKey && config.authDomain && config.projectId && config.appId);
let initialized = false;
export function firebaseServices() {
  if (!firebaseConfigured || typeof window === "undefined") throw new Error("投稿の受付は現在準備中です。");
  const app = getApps().length ? getApp() : initializeApp(config);
  const db = getFirestore(app);
  const auth = getAuth(app);
  if (!initialized) {
    const emulated = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1" && config.projectId?.startsWith("demo-");
    const siteKey = process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY;
    if (emulated) {
      connectFirestoreEmulator(db, "127.0.0.1", 8085);
      connectAuthEmulator(auth, "http://127.0.0.1:9095", { disableWarnings: true });
    } else if (siteKey) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
    initialized = true;
  }
  return { db, auth };
}
export async function submissionUser() {
  const { auth } = firebaseServices();
  await auth.authStateReady();
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
}
