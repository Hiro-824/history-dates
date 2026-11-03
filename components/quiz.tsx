"use client";

import { NavigationLink as Link, useNavigation } from "./navigation";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { eventById, events } from "@/lib/events";
import { priorityStars } from "@/data/priorities";
import { advanceSession, answerParts, formatCentury, formatSubmittedAnswer, formatYear, modeName, normalizeNumber, sameYearHints, submitSession, validAnswer } from "@/lib/study";
import { startStudy, updateStore, useStudyStore } from "@/lib/storage";
import { focusStudyInput, usesMobileKeyboard } from "@/lib/study-keyboard";
import type { HistoryEvent, Session } from "@/lib/types";
import { AppShell } from "./app-shell";
import { EventNote } from "./event-note";
import { PagedFeedback, QuestionText } from "./quiz-content";
import { PageLoading } from "./page-loading";
import { Icon, Modal, Percent } from "./ui";

function MissingSession() { return <><h1>学習データがありません</h1><Link href="/#settings" className="primary home-return">出題設定へ</Link></>; }
export function StudyRoute() {
  const { id } = useParams<{ id: string }>();
  return <StudyPage sessionId={id}/>;
}
export function ResultsRoute() {
  const { id } = useParams<{ id: string }>();
  return <ResultsPage sessionId={id}/>;
}
export function StudyPage({ sessionId }: { sessionId: string }) {
  const { store, ready } = useStudyStore();
  const session = store.sessions.find((s) => s.id === sessionId);
  const event = session ? eventById.get(session.eventIds[session.index]) : undefined;
  if (!ready) return <PageLoading kind="study"/>;
  if (session?.stage === "finished") return <CompletedStudy sessionId={session.id}/>;
  return <AppShell studying>{!session || !event ? <MissingSession/> : <Quiz key={session.id} session={session} event={event}/>}</AppShell>;
}
function CompletedStudy({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(`/results/${sessionId}`); }, [router, sessionId]);
  // The result is already local: show it immediately while the URL catches up.
  return <ResultsPage sessionId={sessionId}/>;
}
function Quiz({ session, event }: { session: Session; event: HistoryEvent }) {
  const router = useRouter();
  useEffect(() => { router.prefetch(`/results/${session.id}`); }, [router, session.id]);
  const [error, setError] = useState(""); const [ending, setEnding] = useState(false);
  const [hint, setHint] = useState<{ index: number; eventId: string; items: HistoryEvent[]; open: boolean } | null>(null);
  const hintId = useId();
  const currentHint = hint?.index === session.index && hint.eventId === event.id ? hint : null;
  const hintShown = !!currentHint?.open;
  const toggleHint = () => setHint(currentHint ? { ...currentHint, open: !currentHint.open } : { index: session.index, eventId: event.id, items: sameYearHints(events, event), open: true });
  const inputRef = useRef<HTMLInputElement>(null); const answerButtonRef = useRef<HTMLButtonElement>(null); const eraGroup = useId();
  const result = session.answers[session.index]; const parts=answerParts(event,session.settings.mode);
  const inputMaxLength = session.settings.mode === "century" ? 2 : 6;
  const answered = !!result;
  const keepKeyboard = !!result?.correct && !event.note && usesMobileKeyboard();
  const advance = useCallback((openKeyboard = false) => {
    let advanced = false;
    let nextSession: Session | undefined;
    const step = () => {
      const next = updateStore((s) => { const value = advanceSession(s,session.id,session.index); advanced = value !== s; return value; });
      nextSession = next.sessions.find((s) => s.id === session.id);
    };
    if (openKeyboard) flushSync(step); else step();
    if (advanced) {
      setError("");
      if (nextSession?.stage !== "finished" && openKeyboard) focusStudyInput(inputRef.current);
    }
  },[session.id,session.index]);
  useEffect(()=>{if(!ending&&!answered)focusStudyInput(inputRef.current);},[session.id,session.index,ending,answered]);
  useEffect(()=>{
    if(!result?.correct||ending||event.note)return;
    const timer=window.setTimeout(()=>{if(window.location.pathname===`/study/${session.id}`)advance();},1000);
    return ()=>window.clearTimeout(timer);
  },[result?.at,result?.correct,ending,session.id,advance,event.note]);
  useEffect(()=>{if(result&&!ending&&!keepKeyboard)answerButtonRef.current?.focus({preventScroll:true});},[result,ending,keepKeyboard]);
  const draft=(patch:Partial<Pick<Session,"input"|"era">>)=>updateStore((s)=>({...s,sessions:s.sessions.map((v)=>v.id===session.id&&v.stage==="active"&&v.answers.length===v.index?{...v,...patch}:v)}));
  const answer=(unknown=false)=>{
    if(result){if(!unknown)advance(true);return;}
    if(!unknown&&!validAnswer(session.input)){setError("1以上の整数を入力してください。");inputRef.current?.focus({preventScroll:true});return;}
    const next=updateStore((s)=>submitSession(s,session.id,session.index,event,new Date().toISOString(),unknown));setError("");
    const submitted=next.sessions.find((s)=>s.id===session.id)?.answers[session.index];
    if(!(submitted?.correct&&!event.note&&usesMobileKeyboard()))inputRef.current?.blur();
  };
  const label=session.settings.mode==="century"?"世紀を答える":"年号を入力";
  const question=event.name.replace(/（上[0-9０-９]+桁(?:を答える|だけでよい)）/g,"");
  return <div className="quiz-page"><div className="quiz-toolbar"><button className="text-button muted" onClick={()=>setEnding(true)}>学習を終了</button><button type="button" className="text-button hint-button" disabled={answered} aria-expanded={!answered&&hintShown} aria-controls={hintId} onClick={toggleHint}>ヒント</button><span className="progress-text">{session.index+1}<span> / {session.eventIds.length}</span></span></div><div className="progress-track" role="progressbar" aria-label="解答済み問題" aria-valuenow={session.answers.length} aria-valuemin={0} aria-valuemax={session.eventIds.length}><div style={{width:`${session.answers.length/session.eventIds.length*100}%`}}/></div><QuestionText text={question}/>
    <form className="answer-form" onSubmit={(e)=>{e.preventDefault();answer();}} onKeyDown={(e)=>{if(e.key!=="Enter")return;if(e.repeat||e.nativeEvent.isComposing){e.preventDefault();return;}if(result){e.preventDefault();advance(true);}}}><label className="sr-only" htmlFor="year-answer">{label}</label>
      <div className={`answer-composer ${result?result.correct?"correct-border":"wrong-border":""}`}>
        <fieldset className="era-toggle"><legend className="sr-only">紀元</legend>{(["BCE","CE"] as const).map((value)=><label key={value} className={session.era===value?"selected":""}><input type="radio" name={eraGroup} aria-label={value==="BCE"?"紀元前":"紀元後"} checked={session.era===value} disabled={!!result} onChange={()=>{draft({era:value});inputRef.current?.focus({preventScroll:true});}}/><span>{value==="BCE"?"前":"後"}</span></label>)}</fieldset>
        <div className="joined-number"><input ref={inputRef} id="year-answer" aria-label={label} type="text" inputMode="numeric" autoComplete="off" enterKeyHint={result?"next":"done"} maxLength={inputMaxLength} style={{width:`${Math.max(1,normalizeNumber(session.input).length)}ch`}} value={session.input} readOnly={answered&&!keepKeyboard} onBeforeInput={(e)=>{if(answered)e.preventDefault();}} aria-invalid={!!error} aria-describedby={error?"answer-error":undefined} onChange={(e)=>{draft({input:normalizeNumber(e.target.value).slice(0,inputMaxLength)});setError("");}}/>{parts.suffix&&<span className="fixed-digits" aria-label={`固定表示 ${parts.suffix}`}>{parts.suffix}</span>}</div><span className="answer-unit">{session.settings.mode==="century"?"世紀":"年"}</span>
      </div><div className="answer-error-slot">{error&&<p className="error-text" id="answer-error" role="alert">{error}</p>}</div>
      <div className="answer-feedback" aria-live="polite" aria-atomic="true">{!result&&hintShown&&currentHint&&<PagedFeedback key={`hint-${session.index}`} label="ヒント"><section className="question-hint" id={hintId}><h2>同じ年の出来事</h2>{currentHint.items.length?<ul>{currentHint.items.map((item)=><li key={item.id}>{item.name.replace(/（上[0-9０-９]+桁(?:を答える|だけでよい)）/g,"")}</li>)}</ul>:<p>同じ年の別の出来事は登録されていません。</p>}</section></PagedFeedback>}{result&&<PagedFeedback key={`${session.index}-${result.at}`}><div className={`feedback ${result.correct?"correct":"incorrect"}`}><div className="feedback-top"><span className="feedback-status"><Icon name={result.correct?"check":"close"}/>{result.unknown?"わからない":result.correct?"正解":"不正解"}</span></div><div className="correct-year">{session.settings.mode==="century"?formatCentury(event):formatYear(event)}</div>{session.settings.mode==="century"&&<div className="answer-detail correct-date"><span>年号</span><strong>{formatYear(event)}</strong></div>}<div className="answer-detail"><span>あなたの解答</span><strong>{formatSubmittedAnswer(event,result.mode,result.input,result.era)}</strong></div><EventNote event={event}/>{result.correct&&<p className="auto-next-hint">{event.note?session.index+1===session.eventIds.length?"読み終えたら「結果を見る」":"読み終えたら「次へ」":"自動で次へ"}</p>}</div></PagedFeedback>}</div><div className="answer-actions"><button ref={answerButtonRef} type="submit" className="primary answer-button" onPointerDown={(e)=>{if(!answered&&usesMobileKeyboard())e.preventDefault();}}>{result?session.index+1===session.eventIds.length?"結果を見る":"次へ":"解答"}<Icon name="arrow" size={19}/></button>{!result&&<button type="button" className="secondary unknown-button" onClick={()=>answer(true)}>わからない</button>}</div><p className="keyboard-hint"><kbd>Enter</kbd> {result?"次へ進む":"解答を確定"}</p>
    </form>{ending&&<Modal title="学習を終了しますか？" onClose={()=>setEnding(false)} footer={<><button className="secondary" onClick={()=>setEnding(false)}>学習に戻る</button><button className="primary" onClick={()=>{updateStore((s)=>({...s,sessions:s.sessions.map((v)=>v.id===session.id?{...v,stage:"finished",completedAt:new Date().toISOString()}:v)}));}}>{session.answers.length?"途中結果を見る":"終了する"}</button></>}><p className="muted">解答済みの{session.answers.length}問は学習記録に保存されています。</p></Modal>}
  </div>;
}
export function ResultsPage({ sessionId }: { sessionId: string }) {
  const { store, ready }=useStudyStore();const { navigate, pending }=useNavigation();const session=store.sessions.find((s)=>s.id===sessionId);
  if(!ready)return <PageLoading kind="results"/>;
  if(!session)return <AppShell><MissingSession/></AppShell>;
  if(session.stage!=="finished")return <AppShell><h1>学習は進行中です</h1><Link className="primary home-return" href={`/study/${session.id}`}>学習を再開</Link></AppShell>;
  const correct=session.answers.filter((a)=>a.correct).length,mistakes=session.answers.filter((a)=>!a.correct);
  const repeat=(retry:boolean)=>navigate(()=>{const next=startStudy({...session.settings,...(retry?{count:"all" as const}:{})},retry?mistakes.map((a)=>a.eventId):session.restrictedIds);return next?`/study/${next.id}`:"/#settings";});
  return <AppShell><div className="results-page"><div className="page-heading"><div><p className="eyebrow">{modeName(session.settings.mode)}</p><h1>学習結果</h1></div></div><section className="result-overview"><div><span>正解数</span><p><strong>{correct}</strong><span> / {session.answers.length}問</span></p></div><div><span>正答率</span><p><strong><Percent correct={correct} total={session.answers.length}/></strong></p></div></section>{session.answers.length<session.eventIds.length&&<p className="help">全{session.eventIds.length}問のうち{session.answers.length}問を解答して終了しました。</p>}<div className="result-actions"><button className="primary" disabled={!mistakes.length||pending} aria-busy={pending} onClick={()=>repeat(true)}><Icon name="repeat" size={18}/>間違えた{mistakes.length}問を再挑戦</button><button className="secondary" disabled={pending} aria-busy={pending} onClick={()=>repeat(false)}>同じ設定でもう一度</button></div><section className="section-block"><div className="section-heading"><h2>間違えた問題</h2><span>{mistakes.length}問</span></div>{mistakes.length?<div className="result-list">{mistakes.map((a)=>{const event=eventById.get(a.eventId);return event&&<div className="result-row" key={event.id}><div className="result-event"><h3>{event.name}</h3><div className="result-answer"><strong className="date-text">{a.mode==="century"?formatCentury(event):formatYear(event)}</strong>{a.mode==="century"&&<span className="result-actual-year">{formatYear(event)}</span>}<span className="priority-stars" aria-label={`優先度 星${event.priority}`}>{priorityStars(event.priority)}</span></div></div></div>;})}</div>:<div className="empty-state">間違えた問題はありません。</div>}</section><Link className="text-button home-return" href="/">学習ホームに戻る<Icon name="arrow" size={16}/></Link></div></AppShell>;
}
