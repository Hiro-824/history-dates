"use client";

import { useEffect } from "react";
import { markDevelopmentLogRead } from "@/lib/development-log";
import { AppShell } from "./app-shell";
import { useEventCatalog } from "./community-provider";

export function DevelopmentLogPage() {
  const { developmentLogEntries, refresh, loading, error } = useEventCatalog();
  useEffect(() => { markDevelopmentLogRead(developmentLogEntries); }, [developmentLogEntries]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    return () => { active = false; };
  }, [refresh]);

  return <AppShell active="development-log"><div className="development-log-page">
    <div className="page-heading"><h1>アップデート</h1></div>
    {loading && <p className="help" role="status">投稿によるアップデートを読み込み中…</p>}
    {error && <p className="help" role="status">投稿によるアップデートを取得できませんでした。</p>}
    {developmentLogEntries.length ? <div className="development-log-list">{developmentLogEntries.map((entry) => <article className="development-log-entry" key={entry.id}>
      <time dateTime={entry.date}>{entry.date.replaceAll("-", "/")}</time>
      <h2>{entry.title}</h2>
      <p>{entry.body}</p>
    </article>)}</div> : !loading && <p className="empty-state">アップデートはまだありません。</p>}
  </div></AppShell>;
}
