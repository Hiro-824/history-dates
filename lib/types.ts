export type Subject = "japan" | "world";
export type Era = "CE" | "BCE";
export type Mode = "exact" | "decade" | "hundred" | "century";
export type Priority = 1 | 2 | 3 | 4 | 5;
export type ScopeMethod = "units" | "region" | "random";

export interface HistoryEvent {
  id: string;
  subject: Subject;
  name: string;
  year: number;
  era: Era;
  dateType: "single" | "range" | "approximate";
  endYear?: number;
  endEra?: Era;
  unitId: string;
  relatedUnitIds?: string[];
  regions: string[];
  priority: Priority;
  period: string;
  themes: string[];
  note?: string;
  answerPrecision?: "decade" | "hundred";
  draftLines?: number[];
  source: string;
}
export interface Unit { id: string; name: string }
export interface UnitGroup { id: string; name: string; subject: Subject; units: Unit[] }
export interface RegionPeriod { id: string; name: string; start: number; end: number; order: number }
export interface StudyRegion { id: string; name: string; subject: Subject; periods: RegionPeriod[] }
export type StudyStatus = "new" | "wrong" | "recent" | "weak" | "review";
export type Order = "random" | "oldest" | "newest" | "weak";
export interface Settings {
  subject: Subject | "both";
  scopeMethod: ScopeMethod;
  unitIds: string[];
  regionId: string;
  startPeriodId: string;
  endPeriodId: string;
  priorities: Priority[];
  mode: Mode;
  balanced: boolean;
  prioritizeUnseen: boolean;
  prioritizeWeak: boolean;
  count: 10 | 20 | 50 | "all";
  order: Order;
  statuses: StudyStatus[];
}
export interface Attempt {
  eventId: string;
  mode: Mode;
  correct: boolean;
  unknown?: boolean;
  input: string;
  era: Era;
  at: string;
}
export interface Score {
  attempts: number;
  correct: number;
  incorrect: number;
  streak: number;
  lastAt: string | null;
  recent: Attempt[];
}
export interface EventHistory extends Score {
  lastCorrect: boolean | null;
  review: boolean;
}
export type History = Record<string, EventHistory>;
export interface Preset { id: string; name: string; settings: Settings }
export interface Session {
  id: string;
  eventIds: string[];
  settings: Settings;
  index: number;
  answers: Attempt[];
  input: string;
  era: Era;
  stage: "active" | "finished";
  createdAt: string;
  completedAt: string | null;
  restrictedIds?: string[];
}
export interface Store {
  version: 2;
  settings: Settings;
  history: History;
  recent: Attempt[];
  presets: Preset[];
  sessions: Session[];
  storageError?: string;
}
