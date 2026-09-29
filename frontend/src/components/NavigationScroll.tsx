"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";

function stabilizeScroll(top: number) {
  const container = document.getElementById("main-content");
  if (!container) {
    window.scrollTo({ top, behavior: "instant" });
    return;
  }

  let frame = 0;
  let timeout = 0;
  const stop = () => {
    window.clearTimeout(timeout);
    window.cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
    window.removeEventListener("pointerdown", stop);
  };
  const restore = () => {
    window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => window.scrollTo({ top, behavior: "instant" }));
  };
  const observer = new MutationObserver(restore);
  observer.observe(container, { childList: true, subtree: true });
  timeout = window.setTimeout(stop, 3000);
  window.addEventListener("wheel", stop, { passive: true });
  window.addEventListener("touchstart", stop, { passive: true });
  window.addEventListener("keydown", stop);
  window.addEventListener("pointerdown", stop);
  restore();
  return stop;
}

/** Next can retain a scrolled list position while a client-rendered detail loads. */
export default function NavigationScroll() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);
  const historyDestination = useRef<string | null>(null);
  const savedPositions = useRef(new Map<string, number>());

  useEffect(() => {
    // Capture before a Link or a row click replaces the long list with a short loader.
    const rememberPosition = () => {
      savedPositions.current.set(window.location.pathname + window.location.search, window.scrollY);
    };
    const onPopState = () => {
      historyDestination.current = window.location.pathname + window.location.search;
    };
    document.addEventListener("click", rememberPosition, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", rememberPosition, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useLayoutEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;

    const destination = window.location.pathname + window.location.search;
    const isHistoryNavigation = historyDestination.current === destination;
    historyDestination.current = null;
    if (isHistoryNavigation) {
      const savedTop = savedPositions.current.get(destination);
      if (savedTop === undefined || savedTop < 1) return;
      return stabilizeScroll(savedTop);
    }
    if (window.location.hash) return;
    // The research library already restores its own position when leaving an article.
    if (pathname === "/research" && window.sessionStorage.getItem("seekcost:research-library-scroll")) return;

    return stabilizeScroll(0);
  }, [pathname]);

  return null;
}
