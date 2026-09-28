"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ResearchSaveState = "idle" | "dirty" | "saving" | "saved" | "failed";

export interface ResearchAutoSaveController<T> {
  state: ResearchSaveState;
  schedule: (value: T) => void;
  flush: (value?: T) => Promise<boolean>;
  retry: () => Promise<boolean>;
  cancel: () => void;
}

export function useResearchAutoSave<T>({
  documentKey,
  delayMs,
  persist,
  onError,
}: {
  documentKey: string | null;
  delayMs: number;
  persist: (value: T) => Promise<void>;
  onError: (error: unknown) => void;
}): ResearchAutoSaveController<T> {
  const [state, setState] = useState<ResearchSaveState>("idle");
  const timerRef = useRef<number | null>(null);
  const latestValueRef = useRef<T | null>(null);
  const revisionRef = useRef(0);
  const latestScheduledRef = useRef(0);
  const persistRef = useRef(persist);
  const onErrorRef = useRef(onError);

  useEffect(() => { persistRef.current = persist; }, [persist]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const persistSnapshot = useCallback(async (snapshot: T, revision: number) => {
    setState("saving");
    try {
      await persistRef.current(snapshot);
      if (revision === latestScheduledRef.current) setState("saved");
      return true;
    } catch (error) {
      if (revision === latestScheduledRef.current) {
        setState("failed");
        onErrorRef.current(error);
      }
      return false;
    }
  }, []);

  const schedule = useCallback((value: T) => {
    latestValueRef.current = value;
    const revision = ++revisionRef.current;
    latestScheduledRef.current = revision;
    clearTimer();
    setState("dirty");
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void persistSnapshot(value, revision);
    }, delayMs);
  }, [clearTimer, delayMs, persistSnapshot]);

  const flush = useCallback(async (value?: T) => {
    clearTimer();
    if (value !== undefined) latestValueRef.current = value;
    const snapshot = latestValueRef.current;
    if (snapshot === null) return true;
    const revision = ++revisionRef.current;
    latestScheduledRef.current = revision;
    return persistSnapshot(snapshot, revision);
  }, [clearTimer, persistSnapshot]);

  const retry = useCallback(async () => {
    const snapshot = latestValueRef.current;
    if (snapshot === null) return false;
    const revision = ++revisionRef.current;
    latestScheduledRef.current = revision;
    return persistSnapshot(snapshot, revision);
  }, [persistSnapshot]);

  const cancel = useCallback(() => {
    clearTimer();
    latestValueRef.current = null;
    latestScheduledRef.current = ++revisionRef.current;
    setState("idle");
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    latestValueRef.current = null;
    latestScheduledRef.current = ++revisionRef.current;
    const frame = window.requestAnimationFrame(() => setState("idle"));
    return () => {
      window.cancelAnimationFrame(frame);
      clearTimer();
    };
  }, [clearTimer, documentKey]);

  return { state, schedule, flush, retry, cancel };
}
