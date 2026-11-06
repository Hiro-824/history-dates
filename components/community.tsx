"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { regionsForSubject } from "@/data/regions";
import { unitGroups } from "@/data/units";
import { priorities, priorityStars } from "@/data/priorities";
import { sameYearEvents, mergeEvents, validateSubmission, type SubmissionInput } from "@/lib/community";
import { communityError, fetchSameYearCommunityEvents, reportCommunityEvent, submitCommunityEvent } from "@/lib/community-client";
import { events as builtins, eventSubjectLabel } from "@/lib/events";
import { formatYear } from "@/lib/study";
import type { HistoryEvent, Priority, Settings } from "@/lib/types";
import { AppShell } from "./app-shell";
import { CommunityStatus, useEventCatalog } from "./community-provider";
import { NavigationLink as Link } from "./navigation";
import { Modal } from "./ui";

export function CommunitySettings({ settings, change }: { settings: Settings; change: (settings: Settings) => void }) {
  const { configured } = useEventCatalog();
  return <section className="community-settings">
    <label className="check-field"><input type="checkbox" checked={!settings.includeUnverified} disabled={!configured} onChange={(event) => change({ ...settings, includeUnverified: !event.target.checked })}/>投稿後未確認の問題は出題しない</label>
    <Link href="/submit" className="text-button"><Plus size={17} aria-hidden="true"/>年号を投稿</Link>
    <CommunityStatus/>
  </section>;
}
const initial: SubmissionInput = { name: "", year: 1, era: "CE", subject: "japan", unitId: "", regionId: "japan", note: "", duplicateChecked: false };
export function SubmissionPage() {
  const { configured, refresh } = useEventCatalog();
  const [input, setInput] = useState(initial);
  const [year, setYear] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const [reviewed, setReviewed] = useState<{ key: string; events: HistoryEvent[]; capped: boolean } | null>(null);
  const busy = useRef(false);
  const reviewBusy = useRef(false);
  const patch = (values: Partial<SubmissionInput>) => { setSuccess(false); setInput((previous) => ({ ...previous, ...values, duplicateChecked: false })); };
  const numericYear = Number(year);
  const validYear = Number.isInteger(numericYear) && numericYear >= 1 && numericYear <= 9999;
  const reviewKey = `${input.era}:${numericYear}`;
  const currentReview = reviewed?.key === reviewKey ? reviewed : null;
  const canSubmit = !!currentReview && !currentReview.capped && input.duplicateChecked && !checking;
  const checkExisting = async () => {
    if (!validYear || reviewBusy.current) return;
    reviewBusy.current = true; setChecking(true); setCheckError(""); setReviewed(null);
    setInput((previous) => ({ ...previous, duplicateChecked: false }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        fetchSameYearCommunityEvents(numericYear, input.era),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("既存データを取得できませんでした。接続を確認して、もう一度お試しください。")), 12_000); }),
      ]);
      setReviewed({ key: reviewKey, events: sameYearEvents(mergeEvents(builtins, result.events), numericYear, input.era), capped: result.capped });
    } catch (cause) { setCheckError(communityError(cause)); }
    finally { clearTimeout(timer); reviewBusy.current = false; setChecking(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current) return;
    setError(""); setSuccess(false);
    busy.current = true; setPending(true);
    try {
      if (!canSubmit) throw new Error("同じ年号の既存データを確認し、重複がないことを確認してください。");
      await submitCommunityEvent(validateSubmission({ ...input, year: Number(year) }));
      setSuccess(true); setInput(initial); setYear(""); setReviewed(null);
      void refresh();
    } catch (cause) { setError(communityError(cause)); }
    finally { busy.current = false; setPending(false); }
  };
  return <AppShell><div className="submission-page"><div className="page-heading"><h1>年号を投稿</h1></div>
    <p>学習に役立つ年号を教えてください。同じ年号の既存データを確認してから投稿できます。</p>
    <p className="help">個人情報は入力しないでください。出来事を簡潔に記載してください。</p>
    {!configured && <p className="inline-error" role="status">投稿の受付は現在準備中です。</p>}
    {success && <section className="submission-success" role="status"><strong>投稿を受け付けました。</strong></section>}
    <form className="submission-form" onSubmit={submit}><fieldset disabled={pending || checking || !configured}>
      <label className="field"><span>出来事（必須）</span><input name="name" required maxLength={160} value={input.name} onChange={(event) => patch({ name: event.target.value })}/></label>
      <div className="two-fields"><label className="field"><span>紀元</span><select aria-label="投稿する年号の紀元" value={input.era} onChange={(event) => patch({ era: event.target.value as SubmissionInput["era"] })}><option value="CE">紀元後</option><option value="BCE">紀元前</option></select></label><label className="field"><span>年号（必須）</span><input name="year" required type="number" inputMode="numeric" min={1} max={9999} step={1} value={year} onChange={(event) => { patch({}); setYear(event.target.value); }}/></label></div>
      <div className="two-fields"><label className="field"><span>科目</span><select value={input.subject} onChange={(event) => { const subject = event.target.value as SubmissionInput["subject"]; patch({ subject, unitId: "", regionId: regionsForSubject(subject)[0].id }); }}><option value="japan">日本史</option><option value="world">世界史</option></select></label><label className="field"><span>地域</span><select value={input.regionId} onChange={(event) => patch({ regionId: event.target.value })}>{regionsForSubject(input.subject).map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label></div>
      <label className="field"><span>単元（任意）</span><select value={input.unitId} onChange={(event) => patch({ unitId: event.target.value })}><option value="">わからない・未分類</option>{unitGroups.filter((group) => group.subject === input.subject).map((group) => <optgroup key={group.id} label={group.name}>{group.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</optgroup>)}</select></label>
      <p className="help">単元が未分類の投稿は、全範囲ランダム・地域×時代の設定で出題できます。</p>
      <label className="field"><span>優先度（任意）</span><select name="priority" value={input.priority ?? ""} onChange={(event) => patch({ priority: event.target.value === "" ? undefined : Number(event.target.value) as Priority })}><option value="">指定しない（★★★・標準）</option>{priorities.map((priority) => <option key={priority.value} value={priority.value}>{priorityStars(priority.value)}・{priority.label}</option>)}</select></label>
      <label className="field"><span>語呂合わせ・備考（任意）</span><textarea name="note" rows={4} maxLength={1000} value={input.note} onChange={(event) => patch({ note: event.target.value })}/></label>
      <section className="same-year-check" aria-labelledby="same-year-heading"><h2 id="same-year-heading">投稿前の重複確認</h2>
        <p className="help">同じ年でも別の出来事なら投稿できます。日本史・世界史と投稿された問題を含めて、同じ出来事が登録されていないか確認してください。</p>
        <button type="button" className="secondary check-existing-button" disabled={!validYear || checking || !configured} onClick={() => void checkExisting()}>{checking ? "確認中…" : "同じ年号の既存データを確認"}</button>
        {checking && <p className="help" role="status">既存データを取得しています…</p>}
        {checkError && <p className="inline-error" role="alert">{checkError}</p>}
        {currentReview && <div className="same-year-results" aria-live="polite"><h3>{formatYear({ year: numericYear, era: input.era })}の既存データ（{currentReview.events.length}件）</h3>
          {currentReview.events.length ? <ul>{currentReview.events.map((event) => <li key={event.id}><strong>{event.name}</strong><small>{eventSubjectLabel(event)}</small>{event.note && <p>{event.note}</p>}</li>)}</ul> : <p>同じ年号のデータは登録されていません。</p>}
          {currentReview.capped ? <p className="inline-error">同じ年号の投稿が多く、すべてを確認できません。現在この年号の投稿は受け付けできません。</p> : <label className="check-field duplicate-confirmation"><input name="duplicateChecked" type="checkbox" required checked={input.duplicateChecked} onChange={(event) => setInput((previous) => ({ ...previous, duplicateChecked: event.target.checked }))}/>既存データを確認し、同じ出来事が登録されていないことを確認しました</label>}
        </div>}
      </section>
      <p className="help">投稿後の編集・削除は管理者が行います。誤りに気づいた場合は問題詳細の「内容を報告」からお知らせください。</p>
      <button type="submit" className="primary" disabled={pending || !configured || !canSubmit}>{pending ? "送信中…" : "投稿する"}</button>
    </fieldset>{error && <p className="inline-error" role="alert">{error}</p>}</form>
    <Link href="/" className="text-button home-return">学習ホームに戻る</Link>
  </div></AppShell>;
}
export function ReportButton({ event }: { event: HistoryEvent }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("incorrect");
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const busy = useRef(false);
  if (!event.reviewStatus) return null;
  return <><button type="button" className="text-button report-button" onClick={() => { setMessage(""); setOpen(true); }}>内容を報告</button>{open && <Modal title="投稿内容を報告" onClose={() => { if (!busy.current) setOpen(false); }}><form className="submission-form" onSubmit={async (e) => {
    e.preventDefault(); if (busy.current) return; busy.current = true; setPending(true); setMessage("");
    try { await reportCommunityEvent(event.id, reason, detail); setOpen(false); setDetail(""); setMessage("報告を受け付けました。"); }
    catch (cause) { setMessage(communityError(cause)); }
    finally { busy.current = false; setPending(false); }
  }}><p>{event.name}</p><label className="field"><span>理由</span><select value={reason} disabled={pending} onChange={(e) => setReason(e.target.value)}><option value="incorrect">年号・内容の誤り</option><option value="duplicate">重複</option><option value="inappropriate">不適切な内容</option></select></label><label className="field"><span>補足（任意・500文字以内）</span><textarea maxLength={500} rows={3} disabled={pending} value={detail} onChange={(e) => setDetail(e.target.value)}/></label><button className="primary" disabled={pending}>{pending ? "送信中…" : "報告する"}</button>{message && <p role="alert" className="inline-error">{message}</p>}</form></Modal>}{message && !open && <p className="help" role="status">{message}</p>}</>;
}
