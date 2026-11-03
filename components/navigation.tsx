"use client";

import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ComponentProps, type ReactNode } from "react";

type Destination = string | (() => string | null);

const NavigationContext = createContext<{
  pending: boolean;
  navigate: (destination: Destination, label?: string) => void;
  registerLoading: (label: string) => () => void;
} | null>(null);

function useLoadingVisibility(active: boolean) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    if (active && shownAt.current !== null) return;
    if (!active && shownAt.current === null) return;
    const delay = active ? 250 : Math.max(0, 300 - (performance.now() - shownAt.current!));
    const timer = window.setTimeout(() => {
      shownAt.current = active ? performance.now() : null;
      setVisible(active);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active]);
  return visible;
}

export function NavigationProgress({ label }: { label: string }) {
  return <div className="navigation-progress" role="status"><span className="loading-spinner" aria-hidden="true"/>{label}</div>;
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState({ sources: new Set<symbol>(), label: "ページを読み込んでいます" });
  const registerLoading = useCallback((label: string) => {
    const source = Symbol();
    setFeedback((previous) => ({ sources: new Set(previous.sources).add(source), label }));
    return () => setFeedback((previous) => {
      if (!previous.sources.has(source)) return previous;
      const sources = new Set(previous.sources);
      sources.delete(source);
      return { ...previous, sources };
    });
  }, []);
  const visible = useLoadingVisibility(pending || feedback.sources.size > 0);
  const locked = useRef(false);
  useEffect(() => { if (!pending) locked.current = false; }, [pending]);
  const navigate = useCallback((destination: Destination, message = "学習を準備しています") => {
    if (locked.current) return;
    locked.current = true;
    try {
      const href = typeof destination === "function" ? destination() : destination;
      if (!href) { locked.current = false; return; }
      setFeedback((previous) => ({ ...previous, label: message }));
      startTransition(() => router.push(href));
    } catch (error) { locked.current = false; throw error; }
  }, [router]);
  return <NavigationContext.Provider value={{ pending, navigate, registerLoading }}>{children}{visible && <NavigationProgress label={feedback.label}/>}</NavigationContext.Provider>;
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (!context) throw new Error("NavigationProvider is required");
  return context;
}

export function useLoadingFeedback(active: boolean, label: string) {
  const { registerLoading } = useNavigation();
  useEffect(() => {
    if (active) return registerLoading(label);
  }, [active, label, registerLoading]);
}

function LinkProgress() {
  const { pending } = useLinkStatus();
  useLoadingFeedback(pending, "ページを読み込んでいます");
  return null;
}

export function NavigationLink({ children, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props}>{children}<LinkProgress/></Link>;
}
