"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { eventById } from "@/lib/events";
import { priorityStars } from "@/data/priorities";
import { advanceSession, answerParts, expectedAnswer, formatSubmittedAnswer, formatYear, modeName, normalizeNumber, SUBJECTS, submitSession, validAnswer } from "@/lib/study";
import { startStudy, updateStore, useStudyStore } from "@/lib/storage";
import type { HistoryEvent, Session } from "@/lib/types";
import { AppShell } from "./app-shell";
import { EventNote } from "./event-note";
import { Icon, Modal, Percent } from "./ui";

function MissingSession() { return <><h1>学習データがありません</h1><Link href="/#settings" className="primary home-return">出題設定へ</Link></>; }
export function StudyPage({ sessionId }: { sessionId: string }) {
  const { store, ready } = useStudyStore();
  const session = store.sessions.find((s) => s.id === sessionId);
  const event = session ? eventById.get(session.eventIds[session.index]) : undefined;
  return <AppShell studying>{!ready ? <p className="muted">読み込み中</p> : !session || !event ? <MissingSession/> : session.stage === "finished" ? <CompletedStudy sessionId={session.id}/> : <Quiz key={session.id} session={session} event={event}/>}</AppShell>;
}
function CompletedStudy({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  useEffect(() => { router.replace(`/results/${sessionId}`); }, [router, sessionId]);
  return <Link className="text-button" href={`/results/${sessionId}`}>結果を見る</Link>;
}
function Quiz({ session, event }: { session: Session; event: HistoryEvent }) {
  const router = useRouter();
  const [error, setError] = useState(""); const [ending, setEnding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null); const eraGroup = useId();
  const result = session.answers[session.index]; const parts=answerParts(event,session.settings.mode);
  const advance = useCallback(() => {
    let advanced=false;
    const next=updateStore((s)=>{const value=advanceSession(s,session.id,session.index);advanced=value!==s;return value;});
    if(advanced){setError("");if(next.sessions.find((s)=>s.id===session.id)?.stage==="finished")router.replace(`/results/${session.id}`);}
  },[session.id,session.index,router]);
  useEffect(()=>{if(!ending)inputRef.current?.focus({preventScroll:true});},[session.id,session.index,ending]);
  useEffect(()=>{
    if(!result?.correct||ending||event.note)return;
    const timer=window.setTimeout(()=>{if(window.location.pathname===`/study/${session.id}`)advance();},1000);
    return ()=>window.clearTimeout(timer);
  },[result?.at,result?.correct,ending,session.id,advance,event.note]);
  const draft=(patch:Partial<Pick<Session,"input"|"era">>)=>updateStore((s)=>({...s,sessions:s.sessions.map((v)=>v.id===session.id&&v.stage==="active"&&v.answers.length===v.index?{...v,...patch}:v)}));
  const answer=()=>{
    if(result){advance();return;}
    if(!validAnswer(session.input)){setError("1以上の整数を入力してください。");inputRef.current?.focus({preventScroll:true});return;}
    updateStore((s)=>submitSession(s,session.id,session.index,event));setError("");
  };
  const label=session.settings.mode==="century"?"世紀を答える":parts.suffix?`上${parts.inputDigits}桁を答える`:"年号を入力";
  return <div className="quiz-page"><div className="quiz-toolbar"><button className="text-button muted" onClick={()=>setEnding(true)}>学習を終了</button><span>{modeName(session.settings.mode)}</span><span className="progress-text">{session.index+1}<span> / {session.eventIds.length}</span></span></div><div className="progress-track" role="progressbar" aria-label="解答済み問題" aria-valuenow={session.answers.length} aria-valuemin={0} aria-valuemax={session.eventIds.length}><div style={{width:`${session.answers.length/session.eventIds.length*100}%`}}/></div><div className="question-heading"><span>{SUBJECTS[event.subject]}</span><span className="dot"/><span>{event.period}</span></div><h1 className="question-title">{event.name}</h1>
    <form className="answer-form" onSubmit={(e)=>{e.preventDefault();answer();}} onKeyDown={(e)=>{if(e.key==="Enter"&&(e.repeat||e.nativeEvent.isComposing))e.preventDefault();}}><label className="answer-label" htmlFor="year-answer">{label}</label>
      <div className={`answer-composer ${result?result.correct?"correct-border":"wrong-border":""}`}>
        <fieldset className="era-toggle"><legend className="sr-only">紀元</legend>{(["BCE","CE"] as const).map((value)=><label key={value} className={session.era===value?"selected":""}><input type="radio" name={eraGroup} aria-label={value==="BCE"?"紀元前":"紀元後"} checked={session.era===value} disabled={!!result} onChange={()=>{draft({era:value});inputRef.current?.focus({preventScroll:true});}}/><span>{value==="BCE"?"前":"後"}</span></label>)}</fieldset>
        <div className="joined-number"><input ref={inputRef} id="year-answer" aria-label={label} type="text" inputMode="numeric" autoComplete="off" enterKeyHint={result?"next":"done"} placeholder={"?".repeat(parts.inputDigits)} maxLength={parts.inputDigits} style={{width:`${Math.max(1,session.input?normalizeNumber(session.input).length:parts.inputDigits)}ch`}} value={session.input} readOnly={!!result} aria-invalid={!!error} aria-describedby={error?"answer-error":undefined} onChange={(e)=>{draft({input:normalizeNumber(e.target.value)});setError("");}}/>{parts.suffix&&<span className="fixed-digits" aria-label={`固定表示 ${parts.suffix}`}>{parts.suffix}</span>}</div><span className="answer-unit">{session.settings.mode==="century"?"世紀":"年"}</span>
      </div>{error&&<p className="error-text" id="answer-error" role="alert">{error}</p>}
      <div className="answer-feedback" aria-live="polite" aria-atomic="true">{result&&<div className={`feedback ${result.correct?"correct":"incorrect"}`}><div className="feedback-top"><span className="feedback-status"><Icon name={result.correct?"check":"close"}/>{result.correct?"正解":"不正解"}</span></div><div className="correct-year">{formatYear(event)}</div><div className="answer-detail"><span>あなたの解答</span><strong>{formatSubmittedAnswer(event,result.mode,result.input,result.era)}</strong></div>{session.settings.mode==="century"&&<div className="answer-detail"><span>正しい世紀</span><strong>{event.era==="BCE"?"紀元前":""}{expectedAnswer(event,"century")}世紀</strong></div>}<EventNote event={event}/>{result.correct&&<p className="auto-next-hint">{event.note?session.index+1===session.eventIds.length?"読み終えたら「結果を見る」":"読み終えたら「次へ」":"自動で次へ"}</p>}</div>}</div><button type="submit" className="primary answer-button">{result?session.index+1===session.eventIds.length?"結果を見る":"次へ":"解答"}<Icon name="arrow" size={19}/></button><p className="keyboard-hint"><kbd>Enter</kbd> {result?"次へ進む":"解答を確定"}</p>
    </form>{ending&&<Modal title="学習を終了しますか？" onClose={()=>setEnding(false)} footer={<><button className="secondary" onClick={()=>setEnding(false)}>学習に戻る</button><button className="primary" onClick={()=>{updateStore((s)=>({...s,sessions:s.sessions.map((v)=>v.id===session.id?{...v,stage:"finished",completedAt:new Date().toISOString()}:v)}));router.replace(`/results/${session.id}`);}}>{session.answers.length?"途中結果を見る":"終了する"}</button></>}><p className="muted">解答済みの{session.answers.length}問は学習記録に保存されています。</p></Modal>}
  </div>;
}
export function ResultsPage({ sessionId }: { sessionId: string }) {
  const { store, ready }=useStudyStore();const router=useRouter();const session=store.sessions.find((s)=>s.id===sessionId);
  if(!ready)return <AppShell><p className="muted">読み込み中</p></AppShell>;
  if(!session)return <AppShell><MissingSession/></AppShell>;
  if(session.stage!=="finished")return <AppShell><h1>学習は進行中です</h1><Link className="primary home-return" href={`/study/${session.id}`}>学習を再開</Link></AppShell>;
  const correct=session.answers.filter((a)=>a.correct).length,mistakes=session.answers.filter((a)=>!a.correct);
  const repeat=(retry:boolean)=>{const next=startStudy({...session.settings,...(retry?{count:"all" as const}:{})},retry?mistakes.map((a)=>a.eventId):session.restrictedIds);if(next)router.push(`/study/${next.id}`);else router.push("/#settings");};
  return <AppShell><div className="results-page"><div className="page-heading"><div><p className="eyebrow">{modeName(session.settings.mode)}</p><h1>学習結果</h1></div></div><section className="result-overview"><div><span>正解数</span><p><strong>{correct}</strong><span> / {session.answers.length}問</span></p></div><div><span>正答率</span><p><strong><Percent correct={correct} total={session.answers.length}/></strong></p></div></section>{session.answers.length<session.eventIds.length&&<p className="help">全{session.eventIds.length}問のうち{session.answers.length}問を解答して終了しました。</p>}<div className="result-actions"><button className="primary" disabled={!mistakes.length} onClick={()=>repeat(true)}><Icon name="repeat" size={18}/>間違えた{mistakes.length}問を再挑戦</button><button className="secondary" onClick={()=>repeat(false)}>同じ設定でもう一度</button></div><section className="section-block"><div className="section-heading"><h2>間違えた問題</h2><span>{mistakes.length}問</span></div>{mistakes.length?<div className="result-list">{mistakes.map((a)=>{const event=eventById.get(a.eventId);return event&&<div className="result-row" key={event.id}><div className="result-event"><h3>{event.name}</h3><div className="result-answer"><strong className="date-text">{formatYear(event)}</strong><span className="priority-stars" aria-label={`優先度 星${event.priority}`}>{priorityStars(event.priority)}</span></div></div></div>;})}</div>:<div className="empty-state">間違えた問題はありません。</div>}</section><Link className="text-button home-return" href="/">学習ホームに戻る<Icon name="arrow" size={16}/></Link></div></AppShell>;
}
