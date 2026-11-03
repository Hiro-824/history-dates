"use client";

import { useEffect, useRef, type ReactNode } from "react";

const paths = {
  book: <><path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-3H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v14a4 4 0 0 1 4-3h3z"/></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
  chart: <><path d="M4 4v16h17M9 15v-4M14 15V7M19 15v-6"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>,
  settings: <><path d="M4 7h16M4 17h16M8 4v6M16 14v6"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  repeat: <><path d="m16 3 4 4-4 4M20 7H8a4 4 0 0 0-4 4m4 10-4-4 4-4m-4 4h12a4 4 0 0 0 4-4"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
};
export function Icon({ name, size = 20 }: { name: keyof typeof paths; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export function Modal({ title, children, onClose, footer, className = "" }: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      requestAnimationFrame(() => {
        if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
      });
    };
  }, []);
  return <dialog ref={ref} className={`modal ${className}`} aria-label={title} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-shell">
      <header className="modal-header"><h2>{title}</h2><button type="button" className="icon-button" aria-label="閉じる" onClick={onClose}><Icon name="close" /></button></header>
      <div className="modal-body">{children}</div>
      {footer && <footer className="modal-footer">{footer}</footer>}
    </div>
  </dialog>;
}
export function Percent({ correct, total }: { correct: number; total: number }) {
  return <>{total ? `${Math.round(correct / total * 100)}%` : "—"}</>;
}
export function localDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } as const : {}) }).format(new Date(value));
}
