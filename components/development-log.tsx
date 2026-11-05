"use client";

import { useEffect } from "react";
import { developmentLog } from "@/data/development-log";
import { markDevelopmentLogRead } from "@/lib/development-log";
import { AppShell } from "./app-shell";

export function DevelopmentLogPage() {
  useEffect(() => { markDevelopmentLogRead(); }, []);

  return <AppShell active="development-log"><div className="development-log-page">
    <div className="page-heading"><h1>アップデート</h1></div>
    {developmentLog.length ? <div className="development-log-list">{[...developmentLog].sort((a, b) => b.date.localeCompare(a.date)).map((entry) => <article className="development-log-entry" key={entry.id}>
      <time dateTime={entry.date}>{entry.date.replaceAll("-", "/")}</time>
      <h2>{entry.title}</h2>
      <p>{entry.body}</p>
    </article>)}</div> : <p className="empty-state">アップデートはまだありません。</p>}
  </div></AppShell>;
}
