"use client";
import { NavigationLink as Link } from "./navigation";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useStudyStore } from "@/lib/storage";
import { releaseStudyKeyboard } from "@/lib/study-keyboard";
import { useUnreadDevelopmentLog } from "@/lib/development-log";
import { useEventCatalog } from "./community-provider";
import { Icon } from "./ui";

const activeStudies = new Set<symbol>();

export function AppShell({ children, active = "home", studying = false }: { children: ReactNode; active?: "home" | "library" | "records" | "development-log"; studying?: boolean }) {
  const { store } = useStudyStore();
  const { developmentLogEntries } = useEventCatalog();
  const unreadLog = useUnreadDevelopmentLog(developmentLogEntries);
  const shellRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!studying) return;
    const study = Symbol();
    activeStudies.add(study);
    document.body.classList.add("study-active");
    return () => {
      activeStudies.delete(study);
      if (!activeStudies.size) document.body.classList.remove("study-active");
    };
  }, [studying]);
  useEffect(() => {
    if (!studying) { releaseStudyKeyboard(); return; }
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
    <nav aria-label="メインナビゲーション">{([{ key: "home", href: "/", label: "学習", icon: "book" }, { key: "library", href: "/library", label: "問題一覧", icon: "list" }, { key: "records", href: "/records", label: "学習記録", icon: "chart" }, { key: "development-log", href: "/development-log", label: "アップデート", icon: "bell" }] as const).map((item) => <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""} aria-current={active === item.key ? "page" : undefined} aria-label={item.key === "development-log" ? (unreadLog ? "アップデート（未閲覧の更新あり）" : "アップデート") : undefined}>{item.key === "development-log" ? <span className="notification-icon"><Icon name={item.icon} size={18}/>{unreadLog && <span className="notification-dot" aria-hidden="true"/>}</span> : <Icon name={item.icon} size={18}/>}<span className={item.key === "development-log" ? "updates-tab-label" : undefined}>{item.label}</span></Link>)}</nav><span className="header-note">日本史・世界史</span>
  </div></header><main className={`main-content ${studying ? "is-quiz" : ""}`} id="main-content">{store.storageError && <p className="inline-error" role="alert">{store.storageError}</p>}{children}</main>
  </div>;
}
