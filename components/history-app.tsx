"use client";

import { useNavigation } from "./navigation";
import { events } from "@/lib/events";
import { unitById } from "@/data/units";
import { DEFAULT_SETTINGS, filterEvents, rangeError } from "@/lib/study";
import { startStudy, updateStore, useStudyStore } from "@/lib/storage";
import { useSettingsModal } from "@/lib/settings-modal";
import type { Settings } from "@/lib/types";
import { AppShell } from "./app-shell";
import { CountControl, ModeControl, PriorityFilter, scopeSummary, SettingsModal, SubjectControl, StudyPreferences } from "./settings";
import { Icon } from "./ui";
import { PageLoading } from "./page-loading";

export default function HistoryApp() {
  const { store, ready } = useStudyStore();
  const settings = store.settings;
  const { navigate, pending } = useNavigation();
  const settingsModal = useSettingsModal();
  const change = (next: Settings) => updateStore((s) => ({ ...s, settings: next }));
  const filtered = filterEvents(events, settings, store.history);
  const scopeUnits = settings.unitIds.flatMap((id) => {
    const unit = unitById.get(id);
    return unit && (settings.subject === "both" || unit.subject === settings.subject) ? [unit] : [];
  });
  const sessionCount = settings.count === "all" ? filtered.length : Math.min(settings.count, filtered.length);
  const review = events.filter((e) => (settings.subject === "both" || e.subject === settings.subject) && store.history[e.id]?.review);
  const begin = () => navigate(() => {
    const session = startStudy(settings);
    return session ? `/study/${session.id}` : null;
  });
  const beginReview = () => navigate(() => {
    const session = startStudy({
      ...DEFAULT_SETTINGS, subject: settings.subject, mode: settings.mode, count: settings.count,
      scopeMethod: "units", unitIds: [...new Set(review.map((e) => e.unitId))], order: "weak",
    }, review.map((e) => e.id), true);
    return session ? `/study/${session.id}` : null;
  });

  if (!ready) return <PageLoading/>;
  return <AppShell><div className="home-page">
    <div className="page-heading"><h1>学習</h1></div>
    <section className="study-card">
      <div className="card-body">
        <div className="home-basics"><SubjectControl settings={settings} onChange={change}/><CountControl settings={settings} onChange={change}/></div>
        <fieldset className="field scope-field"><legend>出題範囲</legend><button className="scope-picker" aria-haspopup="dialog" onClick={settingsModal.open}>
          <span className="scope-picker-text"><strong className="scope-selection-value">{scopeSummary(settings)}</strong>
            {settings.scopeMethod === "units" && scopeUnits.length > 0 && <span className="scope-selected-units">{scopeUnits.slice(0, 3).map((unit) => <span key={unit.id}>{unit.name}</span>)}{scopeUnits.length > 3 && <span>ほか{scopeUnits.length - 3}単元</span>}</span>}
          </span><Icon name="arrow" size={18}/>
        </button></fieldset>
        <ModeControl settings={settings} onChange={change}/>
        <PriorityFilter settings={settings} change={change}/>
        <StudyPreferences settings={settings} onChange={change}/>
      </div>
      {ready && !filtered.length && <p className="home-empty error-text">{rangeError(settings) || "条件に一致する問題がありません。星や出題範囲を変更してください。"}</p>}
    </section>
    <div className="home-support"><section className="review-panel"><button className="text-button" disabled={!ready || !review.length || pending} onClick={beginReview}><Icon name="repeat" size={17}/>間違えた問題を復習<span className="review-count">{ready ? review.length : "—"}問</span></button></section></div>
    <div className="start-area home-start-dock"><p className="target-count" aria-live="polite">{ready ? filtered.length : "—"}問から <strong>{ready ? sessionCount : "—"}</strong>問</p><button className="primary start-button" disabled={!ready || !filtered.length || pending} aria-busy={pending} onClick={begin}>{pending ? "準備中…" : "学習開始"}<Icon name="arrow" size={19}/></button></div>
    {settingsModal.opened && <SettingsModal onClose={settingsModal.close}/>}
  </div></AppShell>;
}
