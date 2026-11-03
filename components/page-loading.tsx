"use client";

import { AppShell } from "./app-shell";
import { useLoadingFeedback } from "./navigation";

export function LoadingContent({ label = "読み込んでいます" }: { label?: string }) {
  useLoadingFeedback(true, label);
  return <div className="loading-content" role="region" aria-label={label} aria-busy="true"><div className="loading-placeholders" aria-hidden="true"><span/><span/><span/></div></div>;
}

export function PageLoading({ kind = "home" }: { kind?: "home" | "study" | "results" | "library" | "records" }) {
  const labels = { home: "ページを読み込んでいます", study: "問題を準備しています", results: "学習結果を読み込んでいます", library: "問題一覧を読み込んでいます", records: "学習記録を読み込んでいます" };
  return <AppShell studying={kind === "study"} active={kind === "library" || kind === "records" ? kind : "home"}>
    {kind === "results" && <div className="page-heading"><h1>学習結果</h1></div>}
    <LoadingContent label={labels[kind]}/>
  </AppShell>;
}
