export interface DevelopmentLogEntry {
  id: string;
  date: string;
  title: string;
  body: string;
}

// Add entries only when explicitly requested by the project owner (see AGENTS.md).
// Use a unique ID for each new entry; existing IDs keep their read status.
export const developmentLog: DevelopmentLogEntry[] = [
  {
    id: "2026-11-06-priority-ratings",
    date: "2026-11-06",
    title: "★（優先度）の評価を更新しました",
    body: "割と全面的に見直しました。",
  },
];
