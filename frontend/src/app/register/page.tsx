"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { setToken, setUser } from "@/lib/auth";
import { setStoredTheme } from "@/lib/theme";
import PineLogo from "@/components/PineLogo";
import { useI18n } from "@/components/I18nProvider";
import type { ThemeKey } from "@/lib/theme";

const inputClass = "w-full rounded-lg border border-themed bg-input px-4 py-2.5 text-primary placeholder-themed outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";

export default function RegisterPage() {
  const { t, localeTag } = useI18n();
  const [registration, setRegistration] = useState<"loading" | "open" | "closed" | "error">("loading");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/v1/auth/registration", { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => setRegistration(data.enabled === true ? "open" : "closed"))
      .catch(() => { if (!controller.signal.aborted) setRegistration("error"); });
    return () => controller.abort();
  }, [retry]);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    const cleanUsername = username.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(cleanUsername)) {
      setError(t("auth.invalidUsername"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.shortPassword"));
      return;
    }
    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }

    setLoading(true);
    try {
      const { access_token } = await api.register({
        username: cleanUsername,
        password,
        nickname: nickname.trim() || undefined,
      });
      setToken(access_token);
      const user = await api.me();
      setUser(user);
      if (user.theme) setStoredTheme(user.theme as ThemeKey);
      window.location.href = "/";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("auth.registerFailed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-intro" aria-hidden="true">
        <p className="page-eyebrow">{t("auth.investmentMemory")}</p>
        <p className="auth-intro__title whitespace-pre-line">{t("auth.registerHero")}</p>
        <p className="auth-intro__copy">{t("auth.registerCopy")}</p>
        <div className="auth-intro__path"><span>{t("auth.private")}</span><i /><span>{t("auth.structured")}</span><i /><span>{t("auth.reviewable")}</span></div>
      </div>
      <div className="auth-card">
        <div className="mb-5 flex justify-center"><PineLogo /></div>
        <h1 className="text-center text-2xl font-semibold tracking-[-0.03em] text-primary">{t("auth.registerTitle")}</h1>
        <p className="mb-8 mt-2 text-center text-sm text-muted">{t("auth.registerSubtitle")}</p>

        {error && <div role="alert" className="mb-4 rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-300">{error}</div>}

        {registration !== "open" ? <div className="rounded-xl border border-themed p-5 text-sm text-secondary" role={registration === "error" ? "alert" : "status"}>
          {localeTag.startsWith("zh") ? (registration === "closed" ? "这是一个私人部署的工作台，公开注册已关闭。请联系部署者创建账户；如果你是部署者，请按照部署指南在服务器终端创建自己的账户。" : registration === "error" ? "暂时无法获取注册设置，请重试。" : "正在检查注册设置…") : (registration === "closed" ? "This private workspace has public registration disabled. Contact the instance owner for an account. If you are the owner, follow the deployment guide to create your account from the server terminal." : registration === "error" ? "Unable to check registration settings. Please retry." : "Checking registration settings…")}
          {registration === "error" && <button className="ui-button mt-4" onClick={() => {setRegistration("loading"); setRetry(n => n + 1);}}>{localeTag.startsWith("zh") ? "重试" : "Retry"}</button>}
        </div> : <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm text-secondary">{t("auth.username")}</label>
            <input id="username" name="username" type="text" value={username} onChange={(event) => setUsername(event.target.value)}
              required autoFocus minLength={3} maxLength={32} autoComplete="username" className={inputClass} placeholder={t("auth.usernameRule")} />
          </div>
          <div>
            <label htmlFor="nickname" className="mb-1 block text-sm text-secondary">{t("auth.nickname")}</label>
            <input id="nickname" name="nickname" type="text" value={nickname} onChange={(event) => setNickname(event.target.value)}
              maxLength={64} autoComplete="nickname" className={inputClass} placeholder={t("auth.nicknamePlaceholder")} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm text-secondary">{t("auth.password")}</label>
            <input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
              required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} placeholder={t("auth.passwordRule")} />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1 block text-sm text-secondary">{t("auth.confirmPassword")}</label>
            <input id="confirm-password" name="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)}
              required minLength={8} maxLength={72} autoComplete="new-password" className={inputClass} placeholder={t("auth.confirmPlaceholder")} />
          </div>
          <button type="submit" disabled={loading}
            className="ui-button ui-button--primary w-full disabled:cursor-not-allowed disabled:opacity-50">
            {loading ? t("auth.creating") : t("auth.create")}
          </button>
        </form>}

        <p className="mt-6 text-center text-sm text-muted">
          {t("auth.haveAccount")} <Link href="/login" className="text-accent hover:underline">{t("auth.goLogin")}</Link>
        </p>
      </div>
    </div>
  );
}
