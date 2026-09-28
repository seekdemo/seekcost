"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { setToken, setUser } from "@/lib/auth";
import { setStoredTheme } from "@/lib/theme";
import PineLogo from "@/components/PineLogo";
import { useI18n } from "@/components/I18nProvider";
import type { ThemeKey } from "@/lib/theme";

const inputClass = "w-full rounded-lg border border-themed bg-input px-4 py-2.5 text-primary placeholder-themed outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";

export default function LoginPage() {
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError(t("auth.missingCredentials"));
      return;
    }

    setLoading(true);
    try {
      const { access_token } = await api.login({ username: username.trim(), password });
      setToken(access_token);
      const user = await api.me();
      setUser(user);
      if (user.theme?.startsWith("custom:")) {
        setStoredTheme("custom", user.theme.slice(7));
      } else if (user.theme) {
        setStoredTheme(user.theme as ThemeKey);
      }
      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.loginFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-intro" aria-hidden="true">
        <p className="page-eyebrow">{t("auth.privateByDesign")}</p>
        <p className="auth-intro__title whitespace-pre-line">{t("auth.loginHero")}</p>
        <p className="auth-intro__copy">{t("auth.loginCopy")}</p>
        <div className="auth-intro__path"><span>{t("auth.pathLedger")}</span><i /><span>{t("auth.pathDecision")}</span><i /><span>{t("auth.pathExecute")}</span><i /><span>{t("auth.pathReview")}</span></div>
      </div>
      <div className="auth-card">
        <div className="mb-5 flex justify-center"><PineLogo /></div>
        <h1 className="text-center text-2xl font-semibold tracking-[-0.03em] text-primary">{t("auth.loginTitle")}</h1>
        <p className="mb-8 mt-2 text-center text-sm text-muted">{t("auth.loginSubtitle")}</p>

        {error && <div role="alert" className="mb-4 rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm text-secondary">{t("auth.username")}</label>
            <input id="username" name="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)}
              required autoFocus autoComplete="username" className={inputClass} placeholder={t("auth.usernamePlaceholder")} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-secondary">{t("auth.password")}</label>
            <input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
              required autoComplete="current-password" className={inputClass} placeholder={t("auth.passwordPlaceholder")} />
          </div>
          <button type="submit" disabled={loading}
            className="ui-button ui-button--primary w-full disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? t("auth.loggingIn") : t("auth.login")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          {t("auth.noAccount")} <Link href="/register" className="text-accent hover:underline">{t("auth.createAccount")}</Link>
        </p>
      </div>
    </div>
  );
}
