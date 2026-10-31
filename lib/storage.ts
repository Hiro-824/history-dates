"use client";

import { useSyncExternalStore } from "react";
import legacyUnits from "../data/legacy-units.json";
import { regionById, regionsForSubject } from "../data/regions";
import { unitById } from "../data/units";
import { events } from "./events";
import { DEFAULT_SETTINGS, filterEvents, makeQueue, MODES, ORDERS, selectRegion, selectSubject, STATUSES, weakness } from "./study";
import type { Attempt, EventHistory, History, Mode, Score, Session, Settings, Store } from "./types";

export const STORAGE_KEY = "history-dates:v2";
export const LEGACY_STORAGE_KEY = "history-dates:v1";
const INITIAL: Store = { version: 2, settings: DEFAULT_SETTINGS, history: {}, recent: [], presets: [], sessions: [] };
let snapshot: Store | undefined;
const listeners = new Set<() => void>();
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const era = (value: unknown) => value === "CE" || value === "BCE";
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every((x) => typeof x === "string");
const own = (value: object, key: unknown): key is string => typeof key === "string" && Object.hasOwn(value, key);
export function restoreSettings(value: unknown): Settings {
  if (!object(value)) return structuredClone(DEFAULT_SETTINGS);
  let result = structuredClone(DEFAULT_SETTINGS);
  if (value.subject === "japan" || value.subject === "world" || value.subject === "both") result = selectSubject(result, value.subject);
  if (own(MODES, value.mode)) result.mode = value.mode as Mode;
  if (own(ORDERS, value.order)) result.order = value.order as Settings["order"];
  if ([10, 20, 50, "all"].includes(value.count as number)) result.count = value.count as Settings["count"];
  if (typeof value.balanced === "boolean") result.balanced = value.balanced;
  if (strings(value.statuses)) result.statuses = value.statuses.filter((x) => own(STATUSES, x)) as Settings["statuses"];
  if (value.scopeMethod === "units" || value.scopeMethod === "region" || value.scopeMethod === "random") result.scopeMethod = value.scopeMethod;
  if (strings(value.unitIds)) result.unitIds = [...new Set(value.unitIds.filter((id) => unitById.has(id)))];
  if (Array.isArray(value.priorities)) result.priorities = [...new Set(value.priorities.filter((p): p is 1 | 2 | 3 | 4 | 5 => Number.isInteger(p) && p >= 1 && p <= 5))];
  if (typeof value.regionId === "string" && regionsForSubject(result.subject).some((r) => r.id === value.regionId)) result = selectRegion(result, value.regionId);
  const periods = regionById.get(result.regionId)!.periods;
  const start = periods.find((p) => p.id === value.startPeriodId), end = periods.find((p) => p.id === value.endPeriodId);
  if (start) result.startPeriodId = start.id;
  if (end) result.endPeriodId = end.order >= (start?.order ?? 0) ? end.id : result.startPeriodId;
  return result;
}
function migrateSettings(value: unknown): Settings {
  const result = restoreSettings(value);
  if (!object(value)) return result;
  const oldUnits = strings(value.units) ? value.units : [];
  const aliases = legacyUnits as Record<string, string[]>;
  const unitIds = [...new Set(oldUnits.flatMap((name) => aliases[name] ?? []))];
  if (unitIds.length) return { ...result, scopeMethod: "units", unitIds };
  const regionAliases: Record<string, string> = { "東アジア": "china", "ヨーロッパ": "europe", "西アジア": "west-asia", "中央アジア": "central-asia", "南アジア": "south-asia", "東南アジア": "southeast-asia", "アフリカ": "africa", "北アメリカ": "north-america", "中南アメリカ": "latin-america", "オセアニア": "oceania" };
  if (strings(value.regions) && value.regions.length && result.subject !== "japan") {
    const id = regionAliases[value.regions[0]];
    if (id) return { ...selectRegion(result, id), scopeMethod: "region" };
  }
  return result;
}
function isAttempt(value: unknown): value is Attempt {
  return object(value) && typeof value.eventId === "string" && typeof value.correct === "boolean" && typeof value.input === "string" && era(value.era)
    && own(MODES, value.mode) && typeof value.at === "string" && Number.isFinite(Date.parse(value.at));
}
function isScore(value: unknown): value is Score {
  return object(value) && [value.attempts, value.correct, value.incorrect, value.streak].every((n) => Number.isInteger(n) && Number(n) >= 0)
    && Number(value.attempts) === Number(value.correct) + Number(value.incorrect) && Number(value.streak) <= Number(value.correct)
    && (value.lastAt === null || (typeof value.lastAt === "string" && Number.isFinite(Date.parse(value.lastAt))))
    && Array.isArray(value.recent) && value.recent.every(isAttempt);
}
function restoreHistory(value: Record<string, unknown>): History {
  const result: History = {};
  for (const [id, h] of Object.entries(value)) {
    if (!isScore(h) || !object(h)) continue;
    const recent = h.recent.slice(-10);
    const score = { attempts: h.attempts, correct: h.correct, incorrect: h.incorrect, streak: h.streak, lastAt: h.lastAt, recent };
    result[id] = { ...score, favorite: h.favorite === true, lastCorrect: recent.at(-1)?.correct ?? (typeof h.lastCorrect === "boolean" ? h.lastCorrect : null), review: weakness(score) > 0 };
  }
  return result;
}
function restoreSession(value: unknown): Session | null {
  if (!object(value) || typeof value.id !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(value.id)
    || !strings(value.eventIds) || !value.eventIds.length || new Set(value.eventIds).size !== value.eventIds.length
    || !Number.isInteger(value.index) || Number(value.index) < 0 || Number(value.index) >= value.eventIds.length
    || !Array.isArray(value.answers) || !value.answers.every(isAttempt) || value.answers.length > value.eventIds.length
    || (value.stage !== "active" && value.stage !== "finished") || typeof value.input !== "string" || !era(value.era)
    || typeof value.createdAt !== "string" || !Number.isFinite(Date.parse(value.createdAt))) return null;
  const ids = value.eventIds;
  if (value.answers.some((a, i) => a.eventId !== ids[i])) return null;
  if (value.stage === "active" && value.answers.length !== value.index && value.answers.length !== Number(value.index) + 1) return null;
  return { id: value.id, eventIds: ids, settings: restoreSettings(value.settings), index: Number(value.index), answers: value.answers, input: value.input, era: value.era as Session["era"], stage: value.stage, createdAt: value.createdAt,
    completedAt: typeof value.completedAt === "string" && Number.isFinite(Date.parse(value.completedAt)) ? value.completedAt : null,
    ...(strings(value.restrictedIds) ? { restrictedIds: value.restrictedIds } : {}),
  };
}
export function decodeStore(raw: string): Store {
  const value: unknown = JSON.parse(raw);
  if (!object(value) || (value.version !== 1 && value.version !== 2) || !object(value.history)) throw new Error("invalid store");
  const restore = value.version === 1 ? migrateSettings : restoreSettings;
  return {
    version: 2, settings: restore(value.settings), history: restoreHistory(value.history),
    recent: Array.isArray(value.recent) ? value.recent.filter(isAttempt).slice(-100) : [],
    presets: Array.isArray(value.presets) ? value.presets.filter((p) => object(p) && typeof p.id === "string" && typeof p.name === "string").map((p) => ({ id: p.id, name: p.name, settings: restore(p.settings) })) : [],
    sessions: value.version === 2 && Array.isArray(value.sessions) ? value.sessions.map(restoreSession).filter((s): s is Session => !!s).slice(-20) : [],
  };
}
function readStore(): Store {
  try { const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY); return raw ? decodeStore(raw) : INITIAL; }
  catch { return { ...INITIAL, storageError: "保存データを読み込めませんでした。現在の学習は続けられます。" }; }
}
function getSnapshot() { return snapshot ??= readStore(); }
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY || event.key === null) { snapshot = readStore(); listeners.forEach((notify) => notify()); }
  };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(listener); window.removeEventListener("storage", onStorage); };
}
export function updateStore(update: (previous: Store) => Store): Store {
  const previous = getSnapshot();
  const next = update(previous);
  if (next === previous) return previous;
  delete next.storageError;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
  catch { next.storageError = "ブラウザに保存できません。再読み込みすると今回の変更が失われます。"; }
  snapshot = next; listeners.forEach((notify) => notify());
  return next;
}
export function startStudy(settings: Settings, restrictedIds?: string[], preserveSettings = false): Session | null {
  const store = getSnapshot();
  const pool = restrictedIds ? events.filter((e) => restrictedIds.includes(e.id) && e.dateType === "single") : filterEvents(events, settings, store.history);
  const queue = makeQueue(pool, settings, store.history);
  if (!queue.length) return null;
  const session: Session = { id: crypto.randomUUID(), eventIds: queue.map((e) => e.id), settings: structuredClone(settings), index: 0, answers: [], input: "", era: "CE", stage: "active", createdAt: new Date().toISOString(), completedAt: null, ...(restrictedIds ? { restrictedIds } : {}) };
  updateStore((s) => ({ ...s, settings: preserveSettings ? s.settings : settings, sessions: [...s.sessions, session].slice(-20) }));
  return session;
}
export function toggleFavorite(id: string) {
  updateStore((s) => {
    const h: EventHistory = s.history[id] ?? { attempts: 0, correct: 0, incorrect: 0, streak: 0, lastAt: null, recent: [], favorite: false, lastCorrect: null, review: false };
    return { ...s, history: { ...s.history, [id]: { ...h, favorite: !h.favorite } } };
  });
}
const subscribeReady = () => () => {};
export function useStudyStore() {
  const store = useSyncExternalStore(subscribe, getSnapshot, () => INITIAL);
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  return { store, ready };
}
