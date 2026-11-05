"use client";

import { useSyncExternalStore } from "react";
import { developmentLog } from "../data/development-log";

export const DEVELOPMENT_LOG_STORAGE_KEY = "history-dates:development-log:read";
const changeEvent = "history-dates:development-log-read";
let fallback: string | null = null;

export function readLogIds(value: string | null): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch { return []; }
}

function getSnapshot(): string {
  if (fallback !== null) return fallback;
  try { return window.localStorage.getItem(DEVELOPMENT_LOG_STORAGE_KEY) ?? "[]"; }
  catch { return "[]"; }
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === DEVELOPMENT_LOG_STORAGE_KEY || event.key === null) {
      fallback = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, listener);
  };
}

export function hasUnreadLog(value: string | null): boolean {
  const read = new Set(readLogIds(value));
  return developmentLog.some((entry) => !read.has(entry.id));
}

export function useUnreadDevelopmentLog(): boolean {
  const value = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return value !== null && hasUnreadLog(value);
}

export function markDevelopmentLogRead(): void {
  const read = new Set(readLogIds(getSnapshot()));
  for (const entry of developmentLog) read.add(entry.id);
  const value = JSON.stringify([...read]);
  try {
    window.localStorage.setItem(DEVELOPMENT_LOG_STORAGE_KEY, value);
    fallback = null;
  } catch { fallback = value; }
  window.dispatchEvent(new Event(changeEvent));
}
