"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { events } from "@/lib/events";
import { DEFAULT_SETTINGS, filterEvents, formatYear, modeName, rangeError, SUBJECTS } from "@/lib/study";
import { startStudy, updateStore, useStudyStore } from "@/lib/storage";
import { useSettingsModal } from "@/lib/settings-modal";
import type { Settings } from "@/lib/types";
import { AppShell } from "./app-shell";
import { ModeControl, OrderCount, PriorityFilter, scopeSummary, SettingsModal, SubjectControl } from "./settings";
import { Icon, localDate, Percent } from "./ui";

export default function HistoryApp() {
  const { store, ready } = useStudyStore(); const settings=store.settings; const router=useRouter();
  const settingsModal=useSettingsModal();
  const change=(next:Settings)=>updateStore((s)=>({...s,settings:next}));
  const filtered=filterEvents(events,settings,store.history);
  const sessionCount=settings.count==="all"?filtered.length:Math.min(settings.count,filtered.length);
  const learned=events.filter((e)=>store.history[e.id]?.attempts);
  const total=learned.reduce((n,e)=>n+store.history[e.id].attempts,0), correct=learned.reduce((n,e)=>n+store.history[e.id].correct,0);
  const review=events.filter((e)=>(settings.subject==="both"||e.subject===settings.subject)&&store.history[e.id]?.review);
  const active=store.sessions.findLast((s)=>s.stage==="active");
  const begin=()=>{const session=startStudy(settings);if(session)router.push(`/study/${session.id}`);};
  return <AppShell><div className="page-heading"><h1>学習</h1>{ready&&active&&<Link className="text-button" href={`/study/${active.id}`}>学習を再開（{active.answers.length}/{active.eventIds.length}問）<Icon name="arrow" size={15}/></Link>}</div>
    <div className="home-layout"><section className="study-card"><div className="card-heading"><h2>出題設定</h2><button className="text-button" onClick={settingsModal.open}><Icon name="settings" size={17}/>出題範囲</button></div><div className="card-body"><SubjectControl settings={settings} onChange={change}/><PriorityFilter settings={settings} change={change} compact/><ModeControl settings={settings} onChange={change}/><OrderCount settings={settings} onChange={change}/><div className="scope-summary"><span>出題範囲</span><button onClick={settingsModal.open}>{scopeSummary(settings)}<span aria-hidden="true">›</span></button></div></div><div className="start-area"><div className="target-count">対象 <strong>{ready?filtered.length:"—"}</strong> 問<span>今回 {ready?sessionCount:"—"}問を出題</span></div><button className="primary start-button" disabled={!ready||!filtered.length} onClick={begin}>学習開始<Icon name="arrow" size={19}/></button></div>{ready&&!filtered.length&&<p className="home-empty error-text">{rangeError(settings)||"条件に一致する問題がありません。出題範囲を変更してください。"}</p>}</section>
      <aside className="home-side"><section className="review-panel"><div className="section-heading"><h2>復習</h2><Icon name="repeat" size={19}/></div><p className="review-mode">{SUBJECTS[settings.subject]}</p><div className="review-total"><strong>{ready?review.length:"—"}</strong><span>問</span></div><p className="review-caption">復習対象の問題</p><button className="secondary" disabled={!ready||!review.length} onClick={()=>{const session=startStudy({...DEFAULT_SETTINGS,subject:settings.subject,mode:settings.mode,count:settings.count,scopeMethod:"units",unitIds:[...new Set(review.map((e)=>e.unitId))],order:"weak"},review.map((e)=>e.id),true);if(session)router.push(`/study/${session.id}`);}}>間違えた問題を復習<Icon name="arrow" size={16}/></button></section><section className="home-records"><div className="section-heading"><h2>学習記録</h2><Link className="icon-button" aria-label="学習記録を見る" href="/records"><Icon name="arrow" size={18}/></Link></div><dl><div><dt>学習した問題</dt><dd>{ready?learned.length:"—"}<small> / {events.length}問</small></dd></div><div><dt>累計解答数</dt><dd>{ready?total:"—"}<small>回</small></dd></div><div><dt>正答率</dt><dd>{ready?<Percent correct={correct} total={total}/>:"—"}</dd></div></dl></section></aside>
    </div><section className="section-block home-recent"><div className="section-heading"><h2>最近の解答</h2><Link className="text-button muted" href="/records">すべて見る<Icon name="arrow" size={15}/></Link></div>{store.recent.length?<div className="recent-list">{[...store.recent].reverse().slice(0,3).map((a,i)=>{const event=events.find((e)=>e.id===a.eventId);return event&&<div className="recent-row" key={`${a.at}-${i}`}><span className={`result-symbol ${a.correct?"positive":"negative"}`} aria-label={a.correct?"正解":"不正解"}><Icon name={a.correct?"check":"close"} size={16}/></span><div><strong>{event.name}</strong><small>{SUBJECTS[event.subject]} · {modeName(a.mode)}</small></div><span className="date-text">{formatYear(event)}</span><time dateTime={a.at}>{localDate(a.at)}</time></div>;})}</div>:<div className="empty-state compact">学習履歴はまだありません。</div>}</section>
    {settingsModal.opened&&<SettingsModal onClose={settingsModal.close} onStart={begin}/>}
  </AppShell>;
}
