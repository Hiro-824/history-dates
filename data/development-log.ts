export interface DevelopmentLogEntry {
  id: string;
  date: string;
  title: string;
  body: string;
}

// Add entries when explicitly requested, or when year data changes (see AGENTS.md).
// Use a unique ID for each new entry; existing IDs keep their read status.
export const developmentLog: DevelopmentLogEntry[] = [
  {
    id: "2026-11-06-japanese-history-import",
    date: "2026-11-06",
    title: "日本史年号データを追加",
    body: "日本史の年号データを一気に追加しました。基本的なものは大体入っていると思います。",
  },
  {
    id: "2026-11-06-ww2-end",
    date: "2026-11-06",
    title: "年号データを1件追加",
    body: "1945年「第二次世界大戦終結（ドイツ・日本の降伏）」を追加しました。",
  },
  {
    id: "2026-11-06-priority-ratings",
    date: "2026-11-06",
    title: "★（優先度）の評価を更新しました",
    body: "割と全面的に見直しました。",
  },
];
