"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import { Plus, RotateCw } from "lucide-react";
import { useNavigation } from "./navigation";
import { PageLoading } from "./page-loading";
import { priorityStars } from "@/data/priorities";
import { regionById } from "@/data/regions";
import { unitById } from "@/data/units";
import { eventSubjectLabel, matchesSubject } from "@/lib/events";
import { chronologicalYear, DEFAULT_SETTINGS, formatYear, modeName, SUBJECTS, weakness } from "@/lib/study";
import { startStudy, useStudyStore } from "@/lib/storage";
import type { HistoryEvent, Settings, Store } from "@/lib/types";
import { CommunityStatus, useEventCatalog } from "./community-provider";
import { ReportButton } from "./community";
import { mergeEvents } from "@/lib/community";
import { NavigationLink as Link } from "./navigation";
import { AppShell } from "./app-shell";
import { EventNote } from "./event-note";
import { Icon, localDate, Modal, Percent } from "./ui";

export function LibraryPage() {
  const { events, refresh, loading, configured } = useEventCatalog();
  const {store,ready}=useStudyStore();const history=store.history;
  const [query,setQuery]=useState("");const [subject,setSubject]=useState<Settings["subject"]>("both");const [period,setPeriod]=useState("");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const selected=events.find((event)=>event.id===selectedId)??null;
  const deferredQuery=useDeferredValue(query);
  const candidates=useMemo(()=>events.filter((e)=>matchesSubject(e,subject)).sort((a,b)=>chronologicalYear(a)-chronologicalYear(b)),[subject,events]);
  const periods=[...new Set(candidates.map((e)=>e.period))];
  const q=deferredQuery.trim().replace(/[０-９]/g,(c)=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).toLowerCase();
  const filtered=useMemo(()=>candidates.filter((e)=>(!period||e.period===period)&&(!q||`${e.name} ${e.year} ${formatYear(e)} ${e.era==="BCE"?"bc bce":"ce"}`.toLowerCase().includes(q))),[candidates,period,q]);
  const h=selected?history[selected.id]:undefined;
  if(!ready)return <PageLoading kind="library"/>;
  return <AppShell active="library"><div className="page-heading"><h1>問題一覧</h1><span className="muted">{events.length}問</span></div><div className="community-library-tools"><Link href="/submit" className="text-button"><Plus size={17} aria-hidden="true"/>年号を投稿</Link>{configured&&<button className="icon-button community-refresh" aria-label="投稿問題を更新" title="投稿問題を更新" disabled={loading} onClick={()=>void refresh()}><RotateCw size={18} aria-hidden="true"/></button>}</div><CommunityStatus/><div className="library-controls"><label className="search-field"><Icon name="search" size={19}/><input aria-label="出来事名・年号で検索" placeholder="出来事名・年号で検索" value={query} onChange={(e)=>setQuery(e.target.value)}/></label><div className="library-filters"><select aria-label="科目で絞り込み" value={subject} onChange={(e)=>{setSubject(e.target.value as Settings["subject"]);setPeriod("");}}><option value="both">すべての科目</option><option value="japan">日本史</option><option value="world">世界史</option></select><select aria-label="時代で絞り込み" value={period} onChange={(e)=>setPeriod(e.target.value)}><option value="">すべての時代</option>{periods.map((p)=><option key={p}>{p}</option>)}</select></div></div><div className="list-count" role="status">{query!==deferredQuery?"検索中…":`${filtered.length}問`}</div><div aria-busy={query!==deferredQuery}><LibraryEventTable filtered={filtered} history={history} onSelect={(event)=>setSelectedId(event.id)}/></div>
    {selected&&<Modal title="問題の詳細" onClose={()=>setSelectedId(null)}><div className="event-detail-title"><div><p className="eyebrow">{eventSubjectLabel(selected)} · {selected.period}</p><h3>{selected.name}</h3></div></div><p className="detail-year">{formatYear(selected)}</p><EventNote event={selected}/><ReportButton key={selected.id} event={selected}/><dl className="detail-metadata"><div><dt>単元</dt><dd>{[selected.unitId,...(selected.relatedUnitIds??[])].map((id)=>unitById.get(id)?.name).join("・")||"投稿（未分類）"}</dd></div><div><dt>優先度</dt><dd className="priority-stars" aria-label={`星${selected.priority}`}>{priorityStars(selected.priority)}</dd></div><div><dt>地域</dt><dd>{selected.regions.map((id)=>regionById.get(id)?.name).join("・")}</dd></div></dl><div className="section-heading"><h3>学習状況</h3></div><dl className="detail-metadata"><div><dt>総解答回数</dt><dd>{h?.attempts??0}回</dd></div><div><dt>正解・不正解</dt><dd>{h?.correct??0}正解 / {h?.incorrect??0}不正解</dd></div><div><dt>直近の結果</dt><dd>{h?.lastCorrect==null?"未学習":h.lastCorrect?"正解":"不正解"}</dd></div><div><dt>連続正解</dt><dd>{h?.streak??0}回</dd></div><div><dt>復習対象</dt><dd>{h?.review?"対象":"対象外"}</dd></div></dl>{h?.lastAt&&<p className="help">最終解答：{localDate(h.lastAt,true)}</p>}{selected.source.startsWith("https://")&&<a className="source-link" href={selected.source} target="_blank" rel="noreferrer">年号の参照資料 ↗</a>}</Modal>}
  </AppShell>;
}
const LibraryEventTable=memo(function LibraryEventTable({filtered,history,onSelect}:{filtered:HistoryEvent[];history:Store["history"];onSelect:(event:HistoryEvent)=>void}) {
  return <div className="event-table"><div className="event-table-heading"><span>年号</span><span>出来事</span><span>学習状況</span></div>{filtered.map((event)=>{const h=history[event.id];return <div className="event-row" key={event.id}><strong className="event-year">{formatYear(event)}</strong><button className="event-name-button" onClick={()=>onSelect(event)}><strong>{event.name}</strong><span>{eventSubjectLabel(event)}<span className="separator">/</span>{event.period}</span></button><span className="event-status">{h?.attempts?<><Percent correct={h.correct} total={h.attempts}/><small>{h.attempts}回解答</small></>:<span className="muted">未学習</span>}</span></div>;})}{!filtered.length&&<div className="empty-state">一致する問題がありません。検索語や条件を変更してください。</div>}</div>;
});

export function RecordsPage() {
  const catalog=useEventCatalog();
  const {store,ready}=useStudyStore();const {navigate,pending}=useNavigation();
  const events=mergeEvents(catalog.events,store.sessions.flatMap((session)=>session.eventSnapshots??[]));
  const studied=events.filter((e)=>store.history[e.id]?.attempts);
  const total=studied.reduce((n,e)=>n+store.history[e.id].attempts,0),correct=studied.reduce((n,e)=>n+store.history[e.id].correct,0);
  const weak=catalog.events.filter((event)=>event.reviewStatus!=="unverified"||store.settings.includeUnverified).map((event)=>({event,score:weakness(store.history[event.id])})).filter((x)=>x.score>0).sort((a,b)=>b.score-a.score);
  const recent=[...store.recent].reverse().slice(0,15);
  if(!ready)return <PageLoading kind="records"/>;
  return <AppShell active="records"><div className="page-heading"><h1>学習記録</h1></div><div className="stats-strip"><div><span>学習した問題</span><p><strong>{studied.length}</strong><small> / {events.length}問</small></p></div><div><span>解答回数</span><p><strong>{total}</strong><small>回</small></p></div><div><span>正答率</span><p><strong><Percent correct={correct} total={total}/></strong></p></div></div><section className="section-block"><div className="section-heading"><h2>科目別</h2></div><div className="subject-stats">{(["japan","world"] as const).map((subject)=>{const all=events.filter((e)=>matchesSubject(e,subject)),done=all.filter((e)=>store.history[e.id]?.attempts);const sum=done.reduce((s,e)=>({count:s.count+store.history[e.id].attempts,correct:s.correct+store.history[e.id].correct}),{count:0,correct:0});return <div key={subject}><strong>{SUBJECTS[subject]}</strong><span>{done.length} / {all.length}問</span><div className="subject-track"><div style={{width:`${done.length/all.length*100}%`}}/></div><span>正答率 <b><Percent correct={sum.correct} total={sum.count}/></b></span></div>;})}</div></section><section className="section-block"><div className="section-heading"><h2>復習対象の問題</h2><span>{weak.length}問</span></div>{weak.length?<><div className="compact-list">{weak.slice(0,5).map(({event})=><div key={event.id}><div><strong>{event.name}</strong><small>{eventSubjectLabel(event)}</small></div><span className="date-text">{formatYear(event)}</span></div>)}</div><button className="secondary review-records" disabled={pending} aria-busy={pending} onClick={()=>navigate(()=>{const ids=weak.map(({event})=>event.id);const session=startStudy({...DEFAULT_SETTINGS,mode:store.settings.mode,includeUnverified:store.settings.includeUnverified,count:"all",scopeMethod:"units",unitIds:[...new Set(weak.map(({event})=>event.unitId))],order:"weak"},ids,true,catalog.events);return session?`/study/${session.id}`:null;})}>間違えた問題を復習<Icon name="arrow" size={16}/></button></>:<div className="empty-state">復習対象の問題はありません。</div>}</section><section className="section-block"><div className="section-heading"><h2>最近の解答</h2><span>直近{recent.length}件</span></div>{recent.length?<div className="recent-list">{recent.map((a,i)=>{const event=events.find((e)=>e.id===a.eventId);return event&&<div className="recent-row" key={`${a.at}-${i}`}><span className={`result-symbol ${a.correct?"positive":"negative"}`} aria-label={a.correct?"正解":"不正解"}><Icon name={a.correct?"check":"close"} size={16}/></span><div><strong>{event.name}</strong><small>{modeName(a.mode)}</small></div><time dateTime={a.at}>{localDate(a.at,true)}</time></div>;})}</div>:<div className="empty-state">学習履歴はまだありません。</div>}</section></AppShell>;
}
