"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { isLoggedIn, setUser } from "@/lib/auth";
import { useTheme } from "@/components/ThemeProvider";
import { PRESET_THEMES, PRESET_KEYS } from "@/lib/theme";
import type { UserProfile } from "@/lib/types";
import { ProfileSkeleton } from "@/components/Skeleton";
import { useI18n } from "@/components/I18nProvider";
import { DEFAULT_NAV_ITEMS, NAV_ITEMS, normalizeNavItems } from "@/lib/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const { t, localeTag } = useI18n();
  const { theme, customColor, setTheme, setCustomColor } = useTheme();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("CNY");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  // 修改密码
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [pwdSaving, setPwdSaving] = useState(false);

  const [loadError, setLoadError] = useState("");
  const [navItems, setNavItems] = useState<string[]>([...DEFAULT_NAV_ITEMS]);
  const [navSaving, setNavSaving] = useState(false);
  const [navMsg, setNavMsg] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.push("/login"); return; }
    api.me().then((u) => {
      setProfile(u);
      setNickname(u.nickname || "");
      setDefaultCurrency(u.default_currency || "CNY");
      setNavItems(normalizeNavItems(u.nav_items));
      setUser(u);
      // 从服务端同步自定义主题色
      if (u.theme?.startsWith("custom:")) {
        const color = u.theme.slice(7);
        setCustomColor(color);
      }
      setLoading(false);
    }).catch((err) => {
      // 401 已在 api.ts 内部处理（自动跳 login），这里只处理其他错误
      if (err?.message === "未登录") return;
      setLoadError(err?.message || t("profile.loadFailed"));
      setLoading(false);
    });
  }, [router, setCustomColor, t]);

  /* ── 保存个人信息 ── */
  const handleSave = async () => {
    setSaving(true); setMsg("");
    try {
      const themeToSave = theme === "custom" ? `custom:${customColor}` : theme;
      const updated = await api.updateProfile({ nickname, theme: themeToSave, default_currency: defaultCurrency });
      setProfile(updated);
      setUser(updated);
      setMsg(t("profile.saveSuccess"));
      setTimeout(() => setMsg(""), 2000);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : t("profile.saveFailed"));
    } finally { setSaving(false); }
  };

  /* ── 修改密码 ── */
  const handleChangePwd = async () => {
    setPwdMsg("");
    if (!oldPwd) { setPwdMsg(t("profile.passwordRequired")); return; }
    if (newPwd.length < 8) { setPwdMsg(t("profile.passwordTooShort")); return; }
    if (newPwd !== confirmPwd) { setPwdMsg(t("profile.passwordMismatch")); return; }
    setPwdSaving(true);
    try {
      await api.changePassword({
        old_password: oldPwd,
        new_password: newPwd,
      });
      setPwdMsg(t("profile.passwordChanged"));
      setOldPwd(""); setNewPwd(""); setConfirmPwd("");
      setTimeout(() => setPwdMsg(""), 3000);
    } catch (err: unknown) {
      setPwdMsg(err instanceof Error ? err.message : t("profile.passwordFailed"));
    } finally { setPwdSaving(false); }
  };

  const toggleNavItem = (href: string) => {
    setNavMsg("");
    if (!navItems.includes(href)) {
      setNavItems([...navItems, href]);
    } else if (navItems.length === 1) {
      setNavMsg(t("profile.navKeepOne"));
    } else {
      setNavItems(navItems.filter((item) => item !== href));
    }
  };

  const moveNavItem = (href: string, direction: -1 | 1) => {
    setNavMsg("");
    setNavItems((current) => {
      const index = current.indexOf(href);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const saveNavItems = async () => {
    setNavSaving(true);
    setNavMsg("");
    try {
      const updated = await api.updateProfile({ nav_items: navItems });
      setProfile(updated);
      setNavItems(normalizeNavItems(updated.nav_items));
      setUser(updated);
      setNavMsg(t("profile.navSaved"));
    } catch (err: unknown) {
      setNavMsg(err instanceof Error ? err.message : t("profile.navSaveFailed"));
    } finally {
      setNavSaving(false);
    }
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (loadError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <p className="text-red-400">{loadError}</p>
        <button onClick={() => window.location.reload()}
          className="rounded-lg bg-accent bg-accent-hover px-4 py-2 text-sm font-medium text-on-accent transition">
          {t("profile.retry")}
        </button>
      </div>
    );
  }

  const inputCls = "w-full rounded-lg border border-[var(--border)] bg-input px-4 py-2.5 text-primary placeholder-themed outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]";

  return (
    <div className="page-shell page-shell--reading pb-12">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Preferences</p>
          <h1 className="page-title">{t("profile.title")}</h1>
          <p className="page-description">{t("profile.description")}</p>
        </div>
      </header>

      {/* ── 1. 基本信息 ── */}
      <section className="rounded-2xl border border-themed bg-surface p-6 space-y-5">
        <h2 className="text-lg font-semibold text-primary">{t("profile.basic")}</h2>

        {/* 头像 + 用户名 */}
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent-bg)] text-2xl font-bold text-accent">
            {(profile?.nickname || profile?.username || "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-primary font-medium">{profile?.nickname || profile?.username}</p>
            <p className="text-xs text-muted">
              {profile?.created_at ? t("profile.joined", { date: new Date(profile.created_at).toLocaleDateString(localeTag) }) : ""}
            </p>
          </div>
        </div>

        {/* 昵称 */}
        <div>
          <label className="mb-1 block text-sm text-secondary">{t("profile.nickname")}</label>
          <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)}
            maxLength={20} className={inputCls} placeholder={t("profile.nicknamePlaceholder")} />
        </div>

        {/* 默认货币 */}
        <div>
          <label className="mb-1 block text-sm text-secondary">{t("profile.defaultCurrency")}</label>
          <p className="mb-2 text-xs text-muted">{t("profile.currencyHint")}</p>
          <div className="flex flex-wrap gap-2">
            {[
              { code: "CNY", label: `¥ ${t("profile.currencyCny")}`, flag: "🇨🇳" },
              { code: "USD", label: `$ ${t("profile.currencyUsd")}`, flag: "🇺🇸" },
              { code: "HKD", label: `HK$ ${t("profile.currencyHkd")}`, flag: "🇭🇰" },
            ].map((c) => (
              <button key={c.code} onClick={() => setDefaultCurrency(c.code)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm transition ${
                  defaultCurrency === c.code
                    ? "border-[var(--accent)] bg-[var(--accent-bg)] text-accent font-medium"
                    : "border-[var(--border)] text-secondary hover:border-[var(--border-hover)] hover:bg-surface-hover"
                }`}>
                <span>{c.flag}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button onClick={handleSave} disabled={saving}
            className="rounded-lg bg-accent bg-accent-hover px-5 py-2 text-sm font-medium text-on-accent transition disabled:opacity-50">
            {saving ? t("profile.saving") : t("profile.saveInfo")}
          </button>
          {msg && <span className={`text-sm ${msg === t("profile.saveSuccess") ? "text-ok" : "text-risk"}`}>{msg}</span>}
        </div>
      </section>

      {/* ── 2. 一级菜单 ── */}
      <section className="rounded-2xl border border-themed bg-surface p-4 sm:p-6" aria-labelledby="primary-menu-settings">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="primary-menu-settings" className="text-lg font-semibold text-primary">{t("profile.navTitle")}</h2>
            <p className="mt-1 text-sm leading-6 text-muted">{t("profile.navDescription")}</p>
          </div>
          <button type="button" disabled={navSaving} onClick={() => { setNavItems([...DEFAULT_NAV_ITEMS]); setNavMsg(""); }} className="min-h-10 rounded-lg px-3 text-sm text-secondary hover:bg-surface-hover hover:text-primary disabled:opacity-50">{t("profile.navReset")}</button>
        </div>
        <div className="mt-4 space-y-2">
          {[...navItems, ...NAV_ITEMS.map((item) => item.href).filter((href) => !navItems.includes(href))].map((href) => {
            const item = NAV_ITEMS.find((candidate) => candidate.href === href)!;
            const enabled = navItems.includes(href);
            const index = navItems.indexOf(href);
            return (
              <div key={href} className={`flex min-w-0 items-center gap-2 rounded-xl border border-themed px-3 py-2.5 ${enabled ? "bg-input" : "bg-page"}`}>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary">{t(item.labelKey)}</span>
                {enabled && <div className="flex shrink-0 gap-1" role="group" aria-label={t("profile.navOrderFor", { name: t(item.labelKey) })}>
                  <button type="button" onClick={() => moveNavItem(href, -1)} disabled={navSaving || index === 0} aria-label={t("profile.navMoveUp", { name: t(item.labelKey) })} className="flex h-10 w-10 items-center justify-center rounded-lg text-secondary hover:bg-surface-hover disabled:opacity-30 disabled:hover:bg-transparent">↑</button>
                  <button type="button" onClick={() => moveNavItem(href, 1)} disabled={navSaving || index === navItems.length - 1} aria-label={t("profile.navMoveDown", { name: t(item.labelKey) })} className="flex h-10 w-10 items-center justify-center rounded-lg text-secondary hover:bg-surface-hover disabled:opacity-30 disabled:hover:bg-transparent">↓</button>
                </div>}
                <button type="button" role="switch" aria-checked={enabled} aria-label={t("profile.navToggle", { name: t(item.labelKey) })} onClick={() => toggleNavItem(href)} disabled={navSaving} className={`flex h-10 w-[68px] shrink-0 items-center justify-center rounded-lg border text-xs font-medium transition disabled:opacity-50 ${enabled ? "border-[var(--accent)] bg-[var(--accent-bg)] text-accent" : "border-themed text-muted hover:bg-surface-hover"}`}>
                  {enabled ? t("profile.navShown") : t("profile.navHidden")}
                </button>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={saveNavItems} disabled={navSaving || JSON.stringify(navItems) === JSON.stringify(normalizeNavItems(profile?.nav_items))} className="min-h-10 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent transition hover:opacity-90 disabled:opacity-50">{navSaving ? t("profile.saving") : t("profile.navSave")}</button>
          {navMsg && <p role="status" className={`text-sm ${navMsg === t("profile.navSaved") ? "text-ok" : "text-risk"}`}>{navMsg}</p>}
        </div>
      </section>

      {/* ── 3. 产品与帮助 ── */}
      <section className="rounded-2xl border border-themed bg-surface p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-muted">{t("productInfo.profileHelpEyebrow")}</p>
        <h2 className="mt-2 text-lg font-semibold text-primary">{t("productInfo.profileHelpTitle")}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{t("productInfo.profileHelpDescription")}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/guide" className="ui-button">{t("productInfo.profileGuideLink")}</Link>
          <Link href="/about" className="ui-button">{t("productInfo.profileAboutLink")}</Link>
        </div>
      </section>

      {/* ── 4. 修改密码 ── */}
      <section className="rounded-2xl border border-themed bg-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-primary">{t("profile.changePassword")}</h2>
        <div>
          <label className="mb-1 block text-sm text-secondary">{t("profile.currentPassword")}</label>
          <input type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)}
            className={inputCls} placeholder={t("profile.currentPasswordPlaceholder")} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-secondary">{t("profile.newPassword")}</label>
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
            className={inputCls} placeholder={t("profile.newPasswordPlaceholder")} />
        </div>
        <div>
          <label className="mb-1 block text-sm text-secondary">{t("profile.confirmPassword")}</label>
          <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)}
            className={inputCls} placeholder={t("profile.confirmPasswordPlaceholder")} />
        </div>
        <div className="flex items-center gap-4">
          <button onClick={handleChangePwd} disabled={pwdSaving || !newPwd}
            className="rounded-lg bg-accent bg-accent-hover px-5 py-2 text-sm font-medium text-on-accent transition disabled:opacity-50">
            {pwdSaving ? t("profile.changing") : t("profile.changePassword")}
          </button>
          {pwdMsg && <span className={`text-sm ${pwdMsg === t("profile.passwordChanged") ? "text-ok" : "text-risk"}`}>{pwdMsg}</span>}
        </div>
      </section>

      {/* ── 5. 主题设置 ── */}
      <section className="rounded-2xl border border-themed bg-surface p-6 space-y-4">
        <h2 className="text-lg font-semibold text-primary">{t("profile.themeTitle")}</h2>
        <p className="text-sm text-muted">{t("profile.themeDescription")}</p>

        {/* 预设主题：经典白 / 暗色（迷你界面预览） */}
        <div className="grid max-w-md grid-cols-2 gap-3">
          {PRESET_KEYS.map((key) => {
            const preset = PRESET_THEMES[key];
            const isActive = theme === key;
            const preview = preset.preview;
            return (
              <button key={key} onClick={() => { setTheme(key); api.updateProfile({ theme: key }); }} aria-pressed={isActive}
                className={`group overflow-hidden rounded-xl border text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                  isActive
                    ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                    : "border-[var(--border)] hover:border-[var(--border-hover)]"
                }`}>
                <span className="block p-2.5" style={{ backgroundColor: preview.page }}>
                  <span className="flex h-[4.25rem] flex-col gap-1.5 rounded-lg border p-2" style={{ backgroundColor: preview.surface, borderColor: preview.border }}>
                    <span className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: preview.line }} />
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: preview.line }} />
                      <span className="ml-auto h-3 w-7 rounded-full" style={{ backgroundColor: preset.color }} />
                    </span>
                    <span className="mt-auto h-1.5 w-2/3 rounded-full" style={{ backgroundColor: preview.line }} />
                    <span className="h-1.5 w-1/3 rounded-full" style={{ backgroundColor: preview.line }} />
                  </span>
                </span>
                <span className={`flex items-center justify-between px-3 py-2 text-xs ${isActive ? "font-medium text-accent" : "text-secondary group-hover:text-primary"}`}>
                  {t({ light: "profile.themeLight", dark: "profile.themeDark" }[key])}
                  {isActive && (
                    <svg className="h-3.5 w-3.5 text-accent" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* 自定义颜色 */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-3">
            <span className="text-sm text-secondary">{t("profile.customColor")}</span>
            <div className="h-px flex-1 bg-[var(--border)]" />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {/* 原生颜色选择器 */}
            <label className="relative cursor-pointer">
              <input
                type="color"
                value={customColor}
                onChange={(e) => {
                  setCustomColor(e.target.value);
                  api.updateProfile({ theme: `custom:${e.target.value}` });
                }}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border-2 transition"
                style={{
                  borderColor: theme === "custom" ? customColor : "var(--border)",
                  backgroundColor: customColor,
                }}>
                <svg className="h-5 w-5 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
              </div>
            </label>

            {/* hex 输入 */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customColor}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9a-fA-F]{0,6}$/.test(v)) {
                    if (v.length === 7) {
                      setCustomColor(v);
                      api.updateProfile({ theme: `custom:${v}` });
                    } else {
                      // 正在输入中，仅更新显示
                      setCustomColor(v);
                    }
                  }
                }}
                onBlur={() => {
                  // 如果不完整则回退
                  if (!/^#[0-9a-fA-F]{6}$/.test(customColor)) {
                    setCustomColor("#4f46e5");
                  }
                }}
                className="w-24 rounded-lg border border-[var(--border)] bg-input px-3 py-2 text-center text-sm font-mono text-primary outline-none transition focus:border-[var(--accent)]"
                placeholder="#4f46e5"
                maxLength={7}
              />
            </div>

            {/* 预览色块 */}
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full" style={{ backgroundColor: customColor }} />
              {theme === "custom" && (
                <span className="text-xs text-accent font-medium">{t("profile.current")}</span>
              )}
            </div>
          </div>

          {/* 快捷色板 */}
          <div className="flex flex-wrap gap-2">
            {["#ef4444","#f97316","#eab308","#22c55e","#14b8a6","#0ea5e9","#6366f1","#a855f7","#ec4899","#f43f5e","#84cc16","#06b6d4","#8b5cf6","#d946ef","#f59e0b","#10b981"].map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCustomColor(c);
                  api.updateProfile({ theme: `custom:${c}` });
                }}
                className="h-11 w-11 rounded-full border-2 transition hover:scale-110"
                aria-label={c}
                aria-pressed={customColor === c && theme === "custom"}
                style={{
                  backgroundColor: c,
                  borderColor: customColor === c && theme === "custom" ? "white" : "transparent",
                }}
                title={c}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
