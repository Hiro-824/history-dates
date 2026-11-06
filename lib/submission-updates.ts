import type { DevelopmentLogEntry } from "../data/development-log";
import type { HistoryEvent } from "./types";
import { formatYear } from "./study";

export function submissionUpdates(posts: { event: HistoryEvent; createdAt: string }[]): DevelopmentLogEntry[] {
  const dateFormat = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });
  const unique = new Map<string, { event: HistoryEvent; createdAt: string }>();
  for (const post of posts) {
    if (!post.event.id.startsWith("community-") || !["unverified", "verified"].includes(post.event.reviewStatus ?? "") || !Number.isFinite(Date.parse(post.createdAt))) continue;
    unique.set(post.event.id, post);
  }
  return [...unique.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).map(({ event, createdAt }) => ({
    id: `submission-${event.id}`,
    date: dateFormat.format(new Date(createdAt)),
    title: "年号データを1件追加",
    body: `${formatYear(event)}「${event.name}」を追加しました。`,
  }));
}

export function mergeDevelopmentLogs(manual: DevelopmentLogEntry[], submissions: DevelopmentLogEntry[]): DevelopmentLogEntry[] {
  return [...new Map([...submissions, ...manual].map((entry) => [entry.id, entry])).values()].sort((a, b) => b.date.localeCompare(a.date));
}
