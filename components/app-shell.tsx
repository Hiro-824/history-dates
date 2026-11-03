"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { useStudyStore } from "@/lib/storage";
import { Icon } from "./ui";

export function AppShell({ children, active = "home", studying = false }: { children: ReactNode; active?: "home" | "library" | "records"; studying?: boolean }) {
  const { store } = useStudyStore();
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!studying) return;
    const viewport = window.visualViewport;
    const resize = () => {
      const shell = shellRef.current;
      if (!shell) return;
      shell.style.setProperty("--study-height", `${viewport?.height ?? window.innerHeight}px`);
      shell.style.setProperty("--study-top", `${viewport?.offsetTop ?? 0}px`);
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, [studying]);
  return <div className={`app-shell${studying ? " is-studying" : ""}`} ref={shellRef}><header className="site-header"><div className="header-inner">
    <Link href="/" className="brand" aria-label="覚えよ 学習ホーム"><span className="brand-symbol"><Icon name="book" size={23}/></span><span>覚えよ</span></Link>
    <nav aria-label="メインナビゲーション">{([{ key: "home", href: "/", label: "学習", icon: "book" }, { key: "library", href: "/library", label: "問題一覧", icon: "list" }, { key: "records", href: "/records", label: "学習記録", icon: "chart" }] as const).map((item) => <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""} aria-current={active === item.key ? "page" : undefined}><Icon name={item.icon} size={18}/>{item.label}</Link>)}</nav><span className="header-note">日本史・世界史</span>
  </div></header><main className={`main-content ${studying ? "is-quiz" : ""}`} id="main-content">{store.storageError && <p className="inline-error" role="alert">{store.storageError}</p>}{children}</main>
  </div>;
}
