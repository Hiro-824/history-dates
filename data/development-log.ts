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
    title: "日本史を中心に年号データを236件追加",
    body: "日本史年号CSVの274項目を照合し、既存と重複する38項目を除いて236件追加しました。日本史と世界史に共通する出来事は、同じ問題・学習履歴のまま両科目から学習できます。優先度は既存評価と公開学習資料を参考に設定し、年号の扱いに差がある項目は備考で補足しました。",
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
