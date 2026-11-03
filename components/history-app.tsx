"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { events } from "@/lib/events";
import { DEFAULT_SETTINGS, filterEvents, rangeError } from "@/lib/study";
import { startStudy, updateStore, useStudyStore } from "@/lib/storage";
import { useSettingsModal } from "@/lib/settings-modal";
import type { Settings } from "@/lib/types";
import { AppShell } from "./app-shell";
import { CountControl, ModeControl, PriorityFilter, scopeSummary, SettingsModal, SubjectControl } from "./settings";
import { Icon } from "./ui";

export default function HistoryApp() {
  const { store, ready } = useStudyStore();
  const settings = store.settings;
  const router = useRouter();
  const settingsModal = useSettingsModal();
  const change = (next: Settings) => updateStore((s) => ({ ...s, settings: next }));
  const filtered = filterEvents(events, settings, store.history);
  const sessionCount = settings.count === "all" ? filtered.length : Math.min(settings.count, filtered.length);
  const review = events.filter((e) => (settings.subject === "both" || e.subject === settings.subject) && store.history[e.id]?.review);
  const active = store.sessions.findLast((s) => s.stage === "active");
  const begin = () => {
    const session = startStudy(settings);
    if (session) router.push(`/study/${session.id}`);
  };
  const beginReview = () => {
    const session = startStudy({
      ...DEFAULT_SETTINGS, subject: settings.subject, mode: settings.mode, count: settings.count,
      scopeMethod: "units", unitIds: [...new Set(review.map((e) => e.unitId))], order: "weak",
    }, review.map((e) => e.id), true);
    if (session) router.push(`/study/${session.id}`);
  };

  return <AppShell><div className="home-page">
    <div className="page-heading"><h1>学習</h1>{ready && active && <Link className="text-button" href={`/study/${active.id}`}>つづきから<Icon name="arrow" size={15}/></Link>}</div>
    <section className="study-card">
      <div className="card-heading"><h2>{scopeSummary(settings)}</h2><button className="text-button" onClick={settingsModal.open}><Icon name="settings" size={16}/>出題範囲を細かく選ぶ</button></div>
      <div className="card-body">
        <div className="home-basics"><SubjectControl settings={settings} onChange={change}/><CountControl settings={settings} onChange={change}/></div>
        <ModeControl settings={settings} onChange={change}/>
        <PriorityFilter settings={settings} change={change}/>
      </div>
      <div className="start-area"><p className="target-count" aria-live="polite">{ready ? filtered.length : "—"}問から <strong>{ready ? sessionCount : "—"}</strong>問</p><button className="primary start-button" disabled={!ready || !filtered.length} onClick={begin}>学習開始<Icon name="arrow" size={19}/></button></div>
      {ready && !filtered.length && <p className="home-empty error-text">{rangeError(settings) || "条件に一致する問題がありません。星や出題範囲を変更してください。"}</p>}
    </section>
    <div className="home-support"><section className="review-panel"><button className="text-button" disabled={!ready || !review.length} onClick={beginReview}><Icon name="repeat" size={17}/>間違えた問題を復習<span className="review-count">{ready ? review.length : "—"}問</span></button></section></div>
    {settingsModal.opened && <SettingsModal onClose={settingsModal.close} onStart={begin}/>}
  </div></AppShell>;
}
