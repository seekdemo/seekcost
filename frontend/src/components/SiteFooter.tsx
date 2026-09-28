"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchAdmin } from "@/lib/access";
import { useI18n } from "@/components/I18nProvider";

export default function SiteFooter() {
  const { localeTag } = useI18n();
  const zh = localeTag.startsWith("zh");
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    void fetchAdmin().then(ok => { if (alive) setIsAdmin(ok); });
    return () => { alive = false; };
  }, []);
  const links = [
    {href:"/about", label:zh ? "关于平台" : "About SeekCost"},
    {href:"/guide", label:zh ? "使用指南" : "User guide"},
    ...(isAdmin ? [{href:"/admin", label:zh ? "管理后台" : "Admin"}] : []),
  ];
  return <footer className="site-footer border-t border-themed bg-page" data-testid="site-footer">
    <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-5 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
      <div><p className="text-sm font-semibold tracking-wide text-secondary">SeekCost <span className="ml-2 text-xs font-normal tracking-normal text-muted">{zh ? "让判断有据可循" : "Keep the reasoning with the decision"}</span></p></div>
      <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label={zh ? "网站底部导航" : "Footer navigation"}>
        {links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-md px-2 text-sm transition hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${pathname === link.href ? "text-accent" : "text-secondary"}`}>{link.label}</Link>)}
      </nav>
    </div>
  </footer>;
}
