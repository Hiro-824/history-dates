"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { events as builtins } from "@/lib/events";
import { mergeEvents } from "@/lib/community";
import { firebaseConfigured } from "@/lib/firebase";
import { communityError, fetchCommunityEvents } from "@/lib/community-client";
import type { HistoryEvent } from "@/lib/types";

const CatalogContext = createContext({ events: builtins, loading: false, error: "", capped: false, configured: firebaseConfigured, refresh: async () => {} });
export function CommunityProvider({ children }: { children: ReactNode }) {
  const [community, setCommunity] = useState<HistoryEvent[]>([]);
  const [loading, setLoading] = useState(firebaseConfigured);
  const [error, setError] = useState("");
  const [capped, setCapped] = useState(false);
  const request = useRef(0);
  const load = useCallback(async () => {
    if (!firebaseConfigured) return;
    const current = ++request.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        fetchCommunityEvents(),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("投稿問題を読み込めませんでした。既存の問題で学習できます。")), 12_000); }),
      ]);
      if (current === request.current) { setCommunity(result.events); setCapped(result.capped); setError(""); }
    } catch (cause) {
      if (current === request.current) { setCommunity([]); setError(communityError(cause)); }
    } finally { clearTimeout(timer); if (current === request.current) setLoading(false); }
  }, []);
  const refresh = useCallback(() => { setLoading(firebaseConfigured); setError(""); return load(); }, [load]);
  useEffect(() => {
    let active = true;
    const sequence = request;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; sequence.current++; };
  }, [load]);
  const value = useMemo(() => ({ events: mergeEvents(builtins, community), loading, error, capped, configured: firebaseConfigured, refresh }), [community, loading, error, capped, refresh]);
  return <CatalogContext value={value}>{children}</CatalogContext>;
}
export const useEventCatalog = () => useContext(CatalogContext);
export function CommunityStatus() {
  const { loading, error, capped, refresh } = useEventCatalog();
  if (loading) return <p className="help community-status" role="status">投稿された問題を読み込み中…</p>;
  if (error) return <p className="help community-status" role="status">投稿問題を取得できませんでした。既存の問題で学習できます。 <button className="text-button" onClick={() => void refresh()}>再読み込み</button></p>;
  if (capped) return <p className="help community-status">投稿問題は最大500件を表示・出題しています。</p>;
  return null;
}
