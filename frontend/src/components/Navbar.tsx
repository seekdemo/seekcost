"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { clearAuth, getUser, isLoggedIn } from "@/lib/auth";
import PineLogo from "@/components/PineLogo";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import NotificationBell from "@/components/NotificationBell";
import { useI18n } from "@/components/I18nProvider";
import {
  isProductNavActive,
  isSectionNavActive,
  NAV_ITEMS,
  normalizeNavItems,
  productAreaForPath,
  SECTION_NAV,
  USER_UPDATED_EVENT,
} from "@/lib/navigation";
import type { UserProfile } from "@/lib/types";

export default function Navbar() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const researchFocus = /^\/research\/(?:guide\/[^/]+|\d+)$/.test(pathname);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--app-nav-height", `${nav.getBoundingClientRect().height}px`);
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const row = sectionRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && active) row.scrollLeft = active.offsetLeft - row.offsetLeft - (row.clientWidth - active.clientWidth) / 2;
  }, [pathname, loggedIn]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoggedIn(isLoggedIn());
      setUser(getUser());
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    const syncUser = (event: Event) => {
      const updated = (event as CustomEvent<UserProfile>).detail;
      setUser(updated || getUser());
    };
    window.addEventListener(USER_UPDATED_EVENT, syncUser);
    return () => window.removeEventListener(USER_UPDATED_EVENT, syncUser);
  }, []);

  const handleLogout = () => {
    clearAuth();
    setLoggedIn(false);
    setUser(null);
    router.push("/login");
  };

  const area = productAreaForPath(pathname);
  const sectionItems = area && area !== "workbench" ? SECTION_NAV[area] : [];
  const visibleItems = normalizeNavItems(user?.nav_items)
    .map((href) => NAV_ITEMS.find((item) => item.href === href))
    .filter((item): item is typeof NAV_ITEMS[number] => Boolean(item));

  return (
    <>
      <a href="#main-content" className="skip-to-content">{t("ux.skip")}</a>
      <header ref={navRef} className="app-navigation sticky top-0 z-50 border-b border-themed bg-page">
        <div className="workspace-topbar">
          <div className="workspace-topbar__start">
            <Link href="/" className="workspace-topbar__brand" aria-label={t("nav.homeAria")}>
              <PineLogo className="navbar-brand whitespace-nowrap" />
            </Link>
            {loggedIn && (
              <nav data-testid="primary-navigation" className="platform-primary-tabs" aria-label={t("nav.mainAria")}>
                {visibleItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isProductNavActive(pathname, item.href) ? "page" : undefined}
                    className="workspace-primary-link"
                  >
                    {t(item.labelKey)}
                  </Link>
                ))}
              </nav>
            )}
          </div>

          <div className="workspace-topbar__account">
            <LanguageSwitcher compact={loggedIn} />
            {loggedIn ? (
              <>
                <NotificationBell />
                <Link
                  href="/profile"
                  aria-label={t("nav.profileTitle")}
                  className="flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-1.5 text-sm text-secondary transition hover:bg-surface hover:text-primary"
                  title={t("nav.profileTitle")}
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--accent)]/15 bg-[var(--accent-bg)] text-xs font-bold text-accent">
                    {(user?.nickname || user?.username || "U").charAt(0).toUpperCase()}
                  </span>
                  <span className="workspace-account-name hidden xl:inline">{user?.nickname || user?.username}</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="hidden h-9 items-center whitespace-nowrap rounded-[7px] border border-themed px-3 text-xs text-secondary transition hover:border-red-500 hover:text-red-400 sm:inline-flex"
                >
                  {t("nav.logout")}
                </button>
              </>
            ) : (
              <Link href={pathname === "/login" ? "/register" : "/login"} className="ui-button min-h-9 px-3 py-2">
                {pathname === "/login" ? t("nav.createAccount") : t("nav.login")}
              </Link>
            )}
          </div>
        </div>

        {loggedIn && sectionItems.length > 1 && (
          <div className={`${researchFocus ? 'hidden lg:block' : ''} border-t border-[var(--border)]`}>
            <div ref={sectionRef} data-testid="section-navigation" role="navigation" aria-label={t("nav.sectionAria")} className="workspace-section-navigation">
              {sectionItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isSectionNavActive(pathname, item.href) ? "page" : undefined}
                  className="workspace-section-link"
                >
                    {t(item.labelKey)}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {loggedIn && !researchFocus && (
        <nav className="mobile-primary-navigation fixed inset-x-0 bottom-0 z-[70] border-t border-themed bg-page px-2 pb-[max(.45rem,env(safe-area-inset-bottom))] pt-1.5 md:hidden" aria-label={t("nav.mobileAria")}>
          <div className="mx-auto grid max-w-lg gap-1" style={{ gridTemplateColumns: `repeat(${visibleItems.length}, minmax(0, 1fr))` }}>
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isProductNavActive(pathname, item.href) ? "page" : undefined}
                className={`relative flex min-h-[50px] flex-col items-center justify-center rounded-xl text-[10px] font-medium transition ${isProductNavActive(pathname, item.href) ? "text-accent" : "text-muted"}`}
              >
                {isProductNavActive(pathname, item.href) && <span className="absolute top-0 h-0.5 w-5 rounded-full bg-accent" aria-hidden="true" />}
                <MobileNavIcon name={item.area} />
                <span className="mt-1">{t(item.labelKey)}</span>
              </Link>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}

function MobileNavIcon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    workbench: <><path d="M4 10.5 12 4l8 6.5" /><path d="M6.5 9.5V20h11V9.5M10 20v-6h4v6" /></>,
    portfolio: <><path d="M4 8.5 12 4l8 4.5L12 13 4 8.5Z" /><path d="m4 12 8 4.5 8-4.5M4 15.5 12 20l8-4.5" /></>,
    decision: <><path d="M12 3a7 7 0 0 0-4 12.75V19h8v-3.25A7 7 0 0 0 12 3Z" /><path d="M9 22h6M9.5 10.5l1.5 1.5 3.5-3.5" /></>,
    tools: <><path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5z" /><path d="M16 13v6M13 16h6" /></>,
  };
  return <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
