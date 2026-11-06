"use client";

import { collection, doc, getDocsFromServer, limit, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { COMMUNITY_LIMIT, communityEvent, validateSubmission, type SubmissionInput } from "./community";
import { firebaseServices, submissionUser } from "./firebase";
import type { Era, HistoryEvent } from "./types";

export async function fetchCommunityEvents(): Promise<{ events: HistoryEvent[]; capped: boolean }> {
  const { db } = firebaseServices();
  const snapshot = await getDocsFromServer(query(collection(db, "submissions"), where("reviewStatus", "in", ["unverified", "verified"]), limit(COMMUNITY_LIMIT)));
  return { events: snapshot.docs.map((item) => communityEvent(item.id, item.data())).filter((item): item is HistoryEvent => !!item), capped: snapshot.size === COMMUNITY_LIMIT };
}
export async function fetchSameYearCommunityEvents(year: number, era: Era): Promise<{ events: HistoryEvent[]; capped: boolean }> {
  const { db } = firebaseServices();
  const snapshot = await getDocsFromServer(query(collection(db, "submissions"), where("reviewStatus", "in", ["unverified", "verified"]), where("year", "==", year), where("era", "==", era), limit(COMMUNITY_LIMIT)));
  return { events: snapshot.docs.map((item) => communityEvent(item.id, item.data())).filter((item): item is HistoryEvent => !!item), capped: snapshot.size === COMMUNITY_LIMIT };
}
export async function submitCommunityEvent(input: SubmissionInput) {
  const value = validateSubmission(input);
  const user = await submissionUser();
  const { db } = firebaseServices();
  const submission = doc(collection(db, "submissions"));
  const quota = doc(db, "submissionLimits", user.uid);
  await runTransaction(db, async (transaction) => {
    const previous = await transaction.get(quota);
    const last = previous.data()?.lastAt?.toMillis?.();
    if (typeof last === "number" && Date.now() - last < 60_000) throw new Error("続けて投稿する場合は、前の投稿から1分お待ちください。");
    transaction.set(quota, { lastAt: serverTimestamp(), submissionId: submission.id });
    transaction.set(submission, { ...value, priority: 3, reviewStatus: "unverified", createdAt: serverTimestamp() });
  });
  return submission.id;
}
export async function reportCommunityEvent(eventId: string, reason: string, detail: string) {
  if (!/^community-[A-Za-z0-9]{20}$/.test(eventId) || !["incorrect", "duplicate", "inappropriate"].includes(reason) || detail.trim().length > 500) throw new Error("通報内容を確認してください。");
  const user = await submissionUser();
  const { db } = firebaseServices();
  const report = doc(collection(db, "reports"));
  const quota = doc(db, "reportLimits", user.uid);
  await runTransaction(db, async (transaction) => {
    const previous = await transaction.get(quota);
    const last = previous.data()?.lastAt?.toMillis?.();
    if (typeof last === "number" && Date.now() - last < 60_000) throw new Error("続けて報告する場合は1分お待ちください。");
    transaction.set(quota, { lastAt: serverTimestamp(), reportId: report.id });
    transaction.set(report, { eventId: eventId.slice(10), reason, detail: detail.trim(), createdAt: serverTimestamp() });
  });
}
export function communityError(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (code.includes("permission-denied")) return "受け付けできませんでした。少し待ってから再度お試しください。";
  if (code.includes("network") || code.includes("unavailable") || code.includes("deadline")) return "通信できませんでした。接続を確認して再度お試しください。";
  if (code) return "投稿サービスに接続できませんでした。時間をおいて再度お試しください。";
  return error instanceof Error ? error.message : "処理に失敗しました。再度お試しください。";
}
