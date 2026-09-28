"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

const subscribeToClient = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

interface ResearchArticleShellProps {
  titleId: string;
  progressLabel: string;
  scrollTopLabel: string;
  scrollBottomLabel: string;
  showScrollControls?: boolean;
  className?: string;
  children: (state: { titleVisible: boolean; progress: number }) => ReactNode;
}

export default function ResearchArticleShell({ children, className = "", progressLabel, scrollTopLabel, scrollBottomLabel, showScrollControls = true, titleId }: ResearchArticleShellProps) {
  const articleRef = useRef<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [titleVisible, setTitleVisible] = useState(true);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);
  const portalReady = useSyncExternalStore(subscribeToClient, getClientSnapshot, getServerSnapshot);

  useEffect(() => {
    const update = () => {
      const article = articleRef.current;
      if (!article) return;
      const rect = article.getBoundingClientRect();
      const readable = Math.max(1, article.offsetHeight - window.innerHeight * 0.62);
      setProgress(Math.max(0, Math.min(100, (-rect.top / readable) * 100)));
      const maximumScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      setAtTop(window.scrollY <= 8);
      setAtBottom(maximumScroll - window.scrollY <= 8);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || typeof IntersectionObserver === "undefined") return;
    let title: HTMLElement | null = null;
    const observer = new IntersectionObserver(([entry]) => setTitleVisible(entry.isIntersecting), { rootMargin: "-72px 0px 0px 0px" });
    const observeTitle = () => {
      const nextTitle = document.getElementById(titleId);
      if (nextTitle === title) return;
      observer.disconnect();
      title = nextTitle;
      if (title) observer.observe(title);
    };
    const mutationObserver = new MutationObserver(observeTitle);
    mutationObserver.observe(article, { childList: true, subtree: true });
    observeTitle();
    return () => { mutationObserver.disconnect(); observer.disconnect(); };
  }, [titleId]);

  const scrollTo = (edge: "top" | "bottom") => {
    const reduceMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = edge === "top" ? 0 : Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const scrollControls = showScrollControls && <nav className="research-scroll-controls" aria-label={`${scrollTopLabel} / ${scrollBottomLabel}`}>
    <button type="button" onClick={() => scrollTo("top")} disabled={atTop} aria-label={scrollTopLabel} title={scrollTopLabel}><span aria-hidden="true">↑</span></button>
    <button type="button" onClick={() => scrollTo("bottom")} disabled={atBottom} aria-label={scrollBottomLabel} title={scrollBottomLabel}><span aria-hidden="true">↓</span></button>
  </nav>;

  return <>
    <article ref={articleRef} className={`research-article-shell ${className}`} data-research-article-shell>
      <div className="research-reading-progress" role="progressbar" aria-label={progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
        <span style={{ width: `${progress}%` }} />
      </div>
      {children({ titleVisible, progress })}
    </article>
    {portalReady && scrollControls ? createPortal(scrollControls, document.body) : null}
  </>;
}
