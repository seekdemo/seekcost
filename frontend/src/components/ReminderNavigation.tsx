"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { REMINDER_NAV, reminderDestinationForPath } from "@/lib/navigation";
import "./ReminderNavigation.css";

export default function ReminderNavigation() {
  const pathname = usePathname();
  const { t } = useI18n();
  const current = reminderDestinationForPath(pathname);

  if (!current) return null;

  return (
    <nav className="reminder-navigation alerts-hub-nav" data-testid="reminder-navigation" aria-label={t("nav.reminderAria")}>
      {REMINDER_NAV.map(item => (
        <Link key={item.href} href={item.href} aria-current={item.href === current.href ? "page" : undefined}>
          {t(item.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
