import data from "../data/events.json";
import { regionById } from "../data/regions";
import { unitById } from "../data/units";
import type { HistoryEvent } from "./types";

export function validateEvents(items: unknown[]): HistoryEvent[] {
  const ids = new Set<string>();
  return items.map((item) => {
    const e = item as HistoryEvent;
    if (!e || typeof e.id !== "string" || ids.has(e.id) || !Number.isInteger(e.year) || e.year < 1
      || !["japan", "world"].includes(e.subject) || !["CE", "BCE"].includes(e.era)
      || !["single", "range", "approximate"].includes(e.dateType)
      || !Number.isInteger(e.priority) || e.priority < 1 || e.priority > 5
      || unitById.get(e.unitId)?.subject !== e.subject
      || [e.id, e.name, e.period, e.source].some((v) => typeof v !== "string" || !v.trim())
      || !Array.isArray(e.regions) || !e.regions.length || e.regions.some((r) => regionById.get(r)?.subject !== e.subject)
      || (e.relatedUnitIds && e.relatedUnitIds.some((id) => unitById.get(id)?.subject !== e.subject))) {
      throw new Error(`問題データの属性、ID、単元、地域または年号が不正です: ${e?.id}`);
    }
    ids.add(e.id);
    return e;
  });
}
export const events = validateEvents(data);
export const eventById = new Map(events.map((e) => [e.id, e]));
