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
    title: "星（優先度）の評価を更新しました",
    body: "全546問の星を見直し、300問の評価を変更しました。年号全桁を覚える優先度に合わせた評価を反映しています。世紀モードでは、星の数にかかわらず「すべて」を対象にすることをおすすめします。",
  },
];
