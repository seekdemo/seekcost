"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_LOCALE,
  intlLocale,
  isLocale,
  LOCALE_STORAGE_KEY,
  translate,
  type Locale,
  type TranslationVariables,
} from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  localeTag: string;
  setLocale: (locale: Locale) => void;
  t: (key: string, variables?: TranslationVariables) => string;
};

const I18nContext = createContext<I18nContextValue>({
  locale: DEFAULT_LOCALE,
  localeTag: "en-US",
  setLocale: () => {},
  t: (key, variables) => translate(DEFAULT_LOCALE, key, variables),
});

export function useI18n() {
  return useContext(I18nContext);
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isLocale(stored)) setLocaleState(stored);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    setLocaleState(nextLocale);
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    localeTag: intlLocale(locale),
    setLocale,
    t: (key, variables) => translate(locale, key, variables),
  }), [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
