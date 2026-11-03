"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function QuestionText({ text }: { text: string }) {
  const regionRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const region = regionRef.current;
    const heading = textRef.current;
    if (!region || !heading) return;
    const fit = () => {
      const style = getComputedStyle(region);
      const height = region.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const maximum = parseFloat(style.getPropertyValue("--question-font")) || 29;
      let low = 12, high = maximum;
      while (high - low > .5) {
        const size = (low + high) / 2;
        heading.style.fontSize = `${size}px`;
        if (heading.getBoundingClientRect().height <= height && heading.scrollWidth <= region.clientWidth) low = size;
        else high = size;
      }
      heading.style.fontSize = `${low}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(region);
    return () => observer.disconnect();
  }, [text]);
  return <div className="question-region" ref={regionRef}><h1 className="question-title" ref={textRef}>{text}</h1></div>;
}

export function PagedFeedback({ children, label = "解説" }: { children: ReactNode; label?: string }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ available: 0, viewport: 0, content: 0 });
  const [page, setPage] = useState(0);
  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const measure = () => {
      const next = { available: panelRef.current?.clientHeight ?? 0, viewport: viewport.clientHeight, content: Math.ceil(content.getBoundingClientRect().height) };
      setSize((previous) => previous.available === next.available && previous.viewport === next.viewport && previous.content === next.content ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  // Overlap a line between pages so no text is lost at a page boundary.
  const step = Math.max(1, size.viewport - 24);
  const pages = size.available > 0 && size.content > size.available + 1 ? Math.max(2, Math.ceil((size.content - size.viewport) / step) + 1) : 1;
  const current = Math.min(page, pages - 1);
  const offset = Math.min(current * step, Math.max(0, size.content - size.viewport));
  return <div className="paged-feedback" ref={panelRef}>
    <div className="feedback-viewport" ref={viewportRef}><div className="feedback-content" ref={contentRef} style={{ transform: `translateY(-${offset}px)` }}>{children}</div></div>
    {pages > 1 && <nav className="feedback-pagination" aria-label={`${label}のページ切り替え`} onKeyDown={(event) => event.stopPropagation()}>
      <button type="button" aria-label={`${label}の前のページ`} disabled={current === 0} onClick={() => setPage(current - 1)}>前のページ</button>
      <span aria-live="polite">{current + 1} / {pages}</span>
      <button type="button" aria-label={`${label}の次のページ`} disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>次のページ</button>
    </nav>}
  </div>;
}
