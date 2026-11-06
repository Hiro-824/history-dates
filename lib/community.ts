import { regionById } from "../data/regions";
import { unitById } from "../data/units";
import type { HistoryEvent, Subject } from "./types";

export const COMMUNITY_LIMIT = 500;
export interface SubmissionInput {
  name: string;
  year: number;
  era: "CE" | "BCE";
  subject: Subject;
  unitId: string;
  regionId: string;
  note: string;
  duplicateChecked: boolean;
}
export function validateSubmission(input: SubmissionInput): SubmissionInput {
  const value = { name: input.name.trim(), year: input.year, era: input.era, subject: input.subject, unitId: input.unitId, regionId: input.regionId, note: input.note.trim(), duplicateChecked: input.duplicateChecked };
  if (!value.name || value.name.length > 160) throw new Error("出来事は1〜160文字で入力してください。");
  if (!Number.isInteger(value.year) || value.year < 1 || value.year > 9999) throw new Error("年号は1〜9999の整数で入力してください。");
  if (!["CE", "BCE"].includes(value.era) || !["japan", "world"].includes(value.subject)) throw new Error("科目と紀元を選択してください。");
  if (value.unitId !== "" && unitById.get(value.unitId)?.subject !== value.subject) throw new Error("科目に対応する単元を選択してください。");
  if (regionById.get(value.regionId)?.subject !== value.subject) throw new Error("科目に対応する地域を選択してください。");
  if (value.note.length > 1000) throw new Error("備考は1000文字以内で入力してください。");
  if (value.duplicateChecked !== true) throw new Error("同じ年号の既存データを確認し、重複がないことを確認してください。");
  return value;
}
export function communityEvent(id: string, raw: unknown): HistoryEvent | null {
  if (!/^[A-Za-z0-9]{20}$/.test(id) || !raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.reviewStatus !== "unverified" && data.reviewStatus !== "verified") return null;
  if (["name", "unitId", "regionId", "note"].some((key) => typeof data[key] !== "string")) return null;
  if (data.duplicateChecked !== undefined && data.duplicateChecked !== true) return null;
  try {
    const input = validateSubmission({ ...data, duplicateChecked: true } as unknown as SubmissionInput);
    const priority = data.priority;
    if (!Number.isInteger(priority) || Number(priority) < 1 || Number(priority) > 5) return null;
    return {
      id: `community-${id}`, name: input.name, year: input.year, era: input.era, subject: input.subject,
      dateType: "single", unitId: input.unitId, regions: [input.regionId], priority: priority as HistoryEvent["priority"],
      period: unitById.get(input.unitId)?.name ?? "投稿（未分類）", themes: [], source: "community",
      ...(input.note ? { note: input.note } : {}), reviewStatus: data.reviewStatus,
    };
  } catch { return null; }
}
export function restoreCommunityEvent(raw: unknown): HistoryEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as HistoryEvent;
  if (typeof event.id !== "string" || !event.id.startsWith("community-") || !Array.isArray(event.regions)) return null;
  return communityEvent(event.id.slice(10), { ...event, regionId: event.regions[0], note: event.note ?? "" });
}
export function mergeEvents(builtins: HistoryEvent[], community: HistoryEvent[]): HistoryEvent[] {
  return [...new Map([...community, ...builtins].map((event) => [event.id, event])).values()];
}
export function sameYearEvents(pool: HistoryEvent[], year: number, era: "CE" | "BCE"): HistoryEvent[] {
  return [...new Map(pool.filter((event) => event.year === year && event.era === era).map((event) => [event.id, event])).values()];
}
