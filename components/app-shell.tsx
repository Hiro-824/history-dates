"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { useStudyStore } from "@/lib/storage";
import { Icon } from "./ui";

export function AppShell({ children, active = "home", studying = false }: { children: ReactNode; active?: "home" | "library" | "records"; studying?: boolean }) {
  const { store } = useStudyStore();
  return <div className="app-shell"><header className="site-header"><div className="header-inner">
    <Link href="/" className="brand" aria-label="覚えよ 学習ホーム"><span className="brand-symbol"><Icon name="book" size={23}/></span><span>覚えよ</span></Link>
    <nav aria-label="メインナビゲーション">{([{ key: "home", href: "/", label: "学習", icon: "book" }, { key: "library", href: "/library", label: "問題一覧", icon: "list" }, { key: "records", href: "/records", label: "学習記録", icon: "chart" }] as const).map((item) => <Link key={item.key} href={item.href} className={active === item.key ? "active" : ""} aria-current={active === item.key ? "page" : undefined}><Icon name={item.icon} size={18}/>{item.label}</Link>)}</nav><span className="header-note">日本史・世界史</span>
  </div></header><main className={`main-content ${studying ? "is-quiz" : ""}`} id="main-content">{store.storageError && <p className="inline-error" role="alert">{store.storageError}</p>}{children}</main>
  </div>;
}
