import data from "../data/events.json";
import { regionById } from "../data/regions";
import { unitById } from "../data/units";
import type { HistoryEvent, Subject } from "./types";

export function eventSubjects(event: Pick<HistoryEvent, "subject" | "subjects">): Subject[] {
  return event.subjects ?? [event.subject];
}
export function matchesSubject(event: Pick<HistoryEvent, "subject" | "subjects">, subject: Subject | "both") {
  return subject === "both" || eventSubjects(event).includes(subject);
}
export function eventSubjectLabel(event: Pick<HistoryEvent, "subject" | "subjects">) {
  return eventSubjects(event).map((subject) => subject === "japan" ? "日本史" : "世界史").join("・");
}

export function validateEvents(items: unknown[]): HistoryEvent[] {
  const ids = new Set<string>();
  return items.map((item) => {
    const e = item as HistoryEvent;
    if (!e || typeof e.id !== "string" || ids.has(e.id) || !Number.isInteger(e.year) || e.year < 1
      || !["japan", "world"].includes(e.subject) || !["CE", "BCE"].includes(e.era)
      || (e.subjects !== undefined && (!Array.isArray(e.subjects) || !e.subjects.length
        || new Set(e.subjects).size !== e.subjects.length || !e.subjects.includes(e.subject)
        || e.subjects.some((s) => !["japan", "world"].includes(s))))
      || !["single", "range", "approximate"].includes(e.dateType)
      || !Number.isInteger(e.priority) || e.priority < 1 || e.priority > 5
      || unitById.get(e.unitId)?.subject !== e.subject
      || [e.id, e.name, e.period, e.source].some((v) => typeof v !== "string" || !v.trim())
      || !Array.isArray(e.regions) || !e.regions.length || e.regions.some((r) => !eventSubjects(e).includes(regionById.get(r)?.subject as Subject))
      || (e.note !== undefined && (typeof e.note !== "string" || !e.note.trim()))
      || (e.answerPrecision !== undefined && !["decade", "hundred"].includes(e.answerPrecision))
      || (e.relatedUnitIds && (!Array.isArray(e.relatedUnitIds) || e.relatedUnitIds.some((id) => !eventSubjects(e).includes(unitById.get(id)?.subject as Subject))))) {
      throw new Error(`問題データの属性、ID、単元、地域または年号が不正です: ${e?.id}`);
    }
    ids.add(e.id);
    return e;
  });
}
export const events = validateEvents(data);
export const eventById = new Map(events.map((e) => [e.id, e]));
