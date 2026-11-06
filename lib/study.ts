import { regionById, regionsForSubject } from "../data/regions";
import { matchesSubject } from "./events";
import { unitById } from "../data/units";
import type { Attempt, Era, EventHistory, History, HistoryEvent, Mode, Score, Settings, Store } from "./types";

export const SUBJECTS = { japan: "日本史", world: "世界史", both: "日本史・世界史" };
export const SCOPE_METHODS = { units: "単元から選択", region: "地域×時代から選択", random: "全範囲ランダム" };
export const MODES: Record<Mode, { label: string; detail: string }> = {
  exact: { label: "年号完全解答", detail: "すべての桁を入力" },
  decade: { label: "上の桁を答える", detail: "下一桁表示" },
  hundred: { label: "上の桁を答える", detail: "下二桁表示" },
  century: { label: "世紀を答える", detail: "世紀の数字を入力" },
};
export const modeName = (mode: Mode) => `${MODES[mode].label}${mode === "decade" || mode === "hundred" ? `（${MODES[mode].detail}）` : ""}`;
export const ORDERS = { random: "ランダム", oldest: "古い年代から", newest: "新しい年代から", weak: "苦手な問題を優先" };
export const STATUSES = { new: "未学習", wrong: "過去に間違えた問題", recent: "最近間違えた問題", weak: "苦手な問題", review: "復習対象" };
export const DEFAULT_SETTINGS: Settings = {
  subject: "both", scopeMethod: "random", unitIds: [], regionId: "japan", startPeriodId: "japan-01", endPeriodId: "japan-20",
  priorities: [], mode: "exact", balanced: false, prioritizeUnseen: false, prioritizeWeak: false, count: 10, order: "random", statuses: [],
};
export function chronologicalYear(event: Pick<HistoryEvent, "year" | "era">) { return event.era === "BCE" ? -event.year : event.year; }
export function formatYear(event: Pick<HistoryEvent, "year" | "era">) { return `${event.era === "BCE" ? "紀元前" : ""}${event.year}年`; }
export function formatCentury(event: Pick<HistoryEvent, "year" | "era">) { return `${event.era === "BCE" ? "紀元前" : ""}${Math.ceil(event.year / 100)}世紀`; }
export function formatSignedYear(year: number) { if (year === -3000000) return "先史"; if (year === 9999) return "現在"; return `${year < 0 ? "紀元前" : ""}${Math.abs(year).toLocaleString("ja-JP")}年`; }
export function answerParts(event: Pick<HistoryEvent, "year" | "answerPrecision">, mode: Mode) {
  const digits = String(event.year);
  const fixedDigits = mode === "hundred" || event.answerPrecision === "hundred" ? 2 : mode === "decade" || event.answerPrecision === "decade" ? 1 : 0;
  // Short years retain at least one digit to answer rather than showing the whole answer.
  const fixedCount = Math.min(mode === "century" ? 0 : fixedDigits, digits.length - 1);
  const prefix = mode === "century" ? String(Math.ceil(event.year / 100)) : digits.slice(0, digits.length - fixedCount);
  return { suffix: fixedCount ? digits.slice(-fixedCount) : "", prefix, inputDigits: prefix.length };
}
export function expectedAnswer(event: Pick<HistoryEvent, "year" | "answerPrecision">, mode: Mode) { return Number(answerParts(event, mode).prefix); }
export function normalizeNumber(input: string) { return input.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)); }
export function validAnswer(input: string) { return /^\d{1,6}$/.test(normalizeNumber(input)) && Number(normalizeNumber(input)) > 0; }
export function checkAnswer(event: HistoryEvent, mode: Mode, input: string, era: Era) {
  return validAnswer(input) && era === event.era && Number(normalizeNumber(input)) === expectedAnswer(event, mode);
}
export function formatSubmittedAnswer(event: HistoryEvent, mode: Mode, input: string, era: Era) {
  if (!normalizeNumber(input)) return "わからない";
  const prefix = era === "BCE" ? "紀元前" : "";
  if (mode === "century") return `${prefix}${Number(input)}世紀`;
  return `${prefix}${Number(`${normalizeNumber(input)}${answerParts(event, mode).suffix}`)}年`;
}
export function emptyScore(): Score { return { attempts: 0, correct: 0, incorrect: 0, streak: 0, lastAt: null, recent: [] }; }
export function emptyHistory(): EventHistory { return { ...emptyScore(), lastCorrect: null, review: false }; }
export function weakness(score?: Score) {
  if (!score?.attempts) return 0;
  return Math.max(0, score.recent.filter((a) => !a.correct).length * 2 - score.streak);
}
export function recordAttempt(previous: EventHistory | undefined, attempt: Attempt): EventHistory {
  const base = previous ?? emptyHistory();
  const updated = { ...base, attempts: base.attempts + 1, correct: base.correct + Number(attempt.correct), incorrect: base.incorrect + Number(!attempt.correct), streak: attempt.correct ? base.streak + 1 : 0, lastAt: attempt.at, lastCorrect: attempt.correct, recent: [...base.recent, attempt].slice(-10) };
  return { ...updated, review: weakness(updated) > 0 };
}
export function selectRegion(settings: Settings, regionId: string): Settings {
  const region = regionById.get(regionId);
  if (!region) return settings;
  return { ...settings, regionId, startPeriodId: region.periods[0].id, endPeriodId: region.periods.at(-1)!.id };
}
export function selectSubject(settings: Settings, subject: Settings["subject"]): Settings {
  const next = { ...settings, subject };
  return regionsForSubject(subject).some((r) => r.id === next.regionId) ? next : selectRegion(next, regionsForSubject(subject)[0].id);
}
export function regionRange(settings: Settings) {
  const region = regionById.get(settings.regionId);
  if (!region || (settings.subject !== "both" && region.subject !== settings.subject)) return null;
  const start = region.periods.find((p) => p.id === settings.startPeriodId);
  const end = region.periods.find((p) => p.id === settings.endPeriodId);
  return start && end && start.order <= end.order ? { region, start, end, from: start.start, to: end.end } : null;
}
export function rangeError(settings: Settings) {
  if (settings.scopeMethod === "units" && !settings.unitIds.some((id) => {
    const unit = unitById.get(id); return unit && (settings.subject === "both" || unit.subject === settings.subject);
  })) return "出題する小単元を選択してください。";
  if (settings.scopeMethod === "region" && !regionRange(settings)) return "地域と開始・終了時代を選択してください。終了時代は開始時代以降にしてください。";
  return null;
}
export function filterEvents(events: HistoryEvent[], settings: Settings, history: History, now?: number) {
  if (rangeError(settings)) return [];
  const range = settings.scopeMethod === "region" ? regionRange(settings) : null;
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.id) || event.dateType !== "single") return false;
    seen.add(event.id);
    if (!matchesSubject(event, settings.subject)) return false;
    if (settings.scopeMethod === "units" && ![event.unitId, ...(event.relatedUnitIds ?? [])].some((id) => settings.unitIds.includes(id)
      && (settings.subject === "both" || unitById.get(id)?.subject === settings.subject))) return false;
    if (range && (!matchesSubject(event, range.region.subject) || !event.regions.includes(range.region.id) || chronologicalYear(event) < range.from || chronologicalYear(event) > range.to)) return false;
    if (settings.priorities.length && !settings.priorities.includes(event.priority)) return false;
    const score = history[event.id];
    return !settings.statuses.length || settings.statuses.some((status) => {
      switch (status) {
        case "new": return !score?.attempts;
        case "wrong": return (score?.incorrect ?? 0) > 0;
        case "recent": return score?.recent.some((a) => !a.correct && (now ?? Date.now()) - Date.parse(a.at) < 7 * 86400000) ?? false;
        case "weak": return weakness(score) > 0;
        case "review": return score?.review ?? false;
      }
    });
  });
}
export function shuffled<T>(items: T[], random: () => number = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function sameYearHints(events: HistoryEvent[], question: Pick<HistoryEvent, "id" | "year" | "era">, random = Math.random) {
  const candidates = events.filter((event) => event.id !== question.id && event.dateType === "single" && event.year === question.year && event.era === question.era);
  return shuffled(candidates, random).slice(0, 3);
}
export function makeQueue(events: HistoryEvent[], settings: Settings, history: History, random = Math.random) {
  const queue = shuffled([...new Map(events.map((e) => [e.id, e])).values()], random);
  // The full-range method ignores saved chronological order and subject balancing.
  const order = settings.scopeMethod === "random" ? "random" : settings.order;
  const compareYears = (a: HistoryEvent, b: HistoryEvent) => (order === "oldest" ? 1 : -1) * (chronologicalYear(a) - chronologicalYear(b));
  if (order === "oldest" || order === "newest") queue.sort(compareYears);
  if (order === "weak" || settings.prioritizeWeak) queue.sort((a, b) => weakness(history[b.id]) - weakness(history[a.id]) || lastWrong(history[b.id]) - lastWrong(history[a.id]));
  const count = settings.count === "all" ? queue.length : Math.min(settings.count, queue.length);
  // Apply preferences before limiting or balancing: unseen, weak, then the rest.
  const groups: HistoryEvent[][] = [];
  let remainingPool = queue;
  if (settings.prioritizeUnseen) {
    groups.push(remainingPool.filter((e) => !history[e.id]?.attempts));
    remainingPool = remainingPool.filter((e) => !!history[e.id]?.attempts);
  }
  if (settings.prioritizeWeak) {
    groups.push(remainingPool.filter((e) => weakness(history[e.id]) > 0));
    remainingPool = remainingPool.filter((e) => weakness(history[e.id]) <= 0);
  }
  groups.push(remainingPool);
  const result: HistoryEvent[] = [];
  for (const group of groups) {
    const remaining = count - result.length;
    if (remaining <= 0) break;
    if (settings.scopeMethod !== "random" && settings.balanced && settings.subject === "both") {
      const japan = group.filter((e) => e.subject === "japan"), world = group.filter((e) => e.subject === "world");
      const mixed: HistoryEvent[] = [];
      const japanCount = result.filter((e) => e.subject === "japan").length;
      const worldCount = result.length - japanCount;
      let next = japanCount === worldCount ? (random() < .5 ? japan : world) : japanCount < worldCount ? japan : world;
      while (mixed.length < remaining && (japan.length || world.length)) {
        const other = next === japan ? world : japan;
        const event = next.shift() ?? other.shift();
        if (event) mixed.push(event);
        next = other;
      }
      result.push(...(order === "oldest" || order === "newest" ? mixed.sort(compareYears) : mixed));
    } else {
      result.push(...group.slice(0, remaining));
    }
  }
  return result;
}
function lastWrong(score?: Score) { return Math.max(0, ...(score?.recent.filter((a) => !a.correct).map((a) => Date.parse(a.at)) ?? [])); }

export function submitSession(store: Store, id: string, index: number, event: HistoryEvent, at = new Date().toISOString(), unknown = false): Store {
  const session = store.sessions.find((s) => s.id === id);
  if (!session || session.stage !== "active" || session.index !== index || session.answers.length !== index || session.eventIds[index] !== event.id || (!unknown && !validAnswer(session.input))) return store;
  const attempt: Attempt = { eventId: event.id, mode: session.settings.mode, input: unknown ? "" : normalizeNumber(session.input), era: session.era, correct: !unknown && checkAnswer(event, session.settings.mode, session.input, session.era), at, ...(unknown ? { unknown: true } : {}) };
  return { ...store, history: { ...store.history, [event.id]: recordAttempt(store.history[event.id], attempt) }, recent: [...store.recent, attempt].slice(-100), sessions: store.sessions.map((s) => s.id === id ? { ...s, input: unknown ? "" : s.input, answers: [...s.answers, attempt] } : s) };
}
export function advanceSession(store: Store, id: string, index: number, at = new Date().toISOString()): Store {
  const session = store.sessions.find((s) => s.id === id);
  if (!session || session.stage !== "active" || session.index !== index || session.answers.length !== index + 1) return store;
  return { ...store, sessions: store.sessions.map((s) => s.id !== id ? s : index + 1 === s.eventIds.length ? { ...s, stage: "finished", completedAt: at } : { ...s, index: index + 1, input: "", era: "CE" }) };
}
