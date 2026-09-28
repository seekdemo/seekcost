"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { useI18n } from "@/components/I18nProvider";

const links = [
  { href: "/about", labelKey: "productInfo.navAbout" },
  { href: "/guide", labelKey: "productInfo.navGuide" },
] as const;

export default function ProductInfoNav() {
  const { t, localeTag } = useI18n();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const controller = new AbortController();
    fetch("/api/v1/admin/me", {headers:{Authorization:`Bearer ${token}`}, signal:controller.signal, cache:"no-store"})
      .then(response => {if (!controller.signal.aborted) setIsAdmin(response.ok);}).catch(() => {});
    return () => controller.abort();
  }, [pathname]);

  return (
    <nav className="product-info-nav" aria-label={t("productInfo.navAria")}>
      <div className="product-info-nav__links">
        {links.map((link) => {
          const current = pathname === link.href;
          return (
            <Link key={link.href} href={link.href} aria-current={current ? "page" : undefined} className={`product-info-nav__link ${current ? "is-current" : ""}`}>
              {t(link.labelKey)}
            </Link>
          );
        })}
      </div>
      {isAdmin && <Link href="/admin" className="product-info-nav__app-link">{localeTag === "zh-CN" ? "内容管理" : "Admin"}</Link>}
      <Link href="/" className="product-info-nav__app-link">{t("productInfo.navApp")}</Link>
    </nav>
  );
}
