"use client";

import { useEffect, useState } from "react";

import { useI18n } from "@/components/I18nProvider";
import type { WatchResearchSectionKey } from "@/lib/types";

export interface ResearchNavigationItem {
  key: WatchResearchSectionKey;
  label: string;
  complete: boolean;
}

export default function ResearchNavigation({ items }: { items: ResearchNavigationItem[] }) {
  const { t } = useI18n();
  const [activeKey, setActiveKey] = useState<WatchResearchSectionKey>(items[0]?.key || "company_overview");

  useEffect(() => {
    const sections = items.map((item) => document.getElementById(`research-${item.key}`)).filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveKey(visible.target.id.replace("research-", "") as WatchResearchSectionKey);
    }, { rootMargin: "-18% 0px -68% 0px", threshold: [0.1, 0.4, 0.8] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label={t("dossier.researchModulesAria")} className="min-w-0">
      <ol className="flex min-w-max gap-1 lg:min-w-0 lg:flex-col">
        {items.map((item) => (
          <li key={item.key}>
            <a
              href={`#research-${item.key}`}
              aria-current={activeKey === item.key ? "location" : undefined}
              className="flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm text-secondary outline-none transition hover:bg-surface hover:text-primary focus-visible:ring-2 focus-visible:ring-[var(--accent)] lg:w-full"
            >
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${item.complete ? "bg-ok" : "bg-[var(--text-muted)]/40"}`} />
              <span>{item.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
