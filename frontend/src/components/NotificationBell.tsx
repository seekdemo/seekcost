"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api, whenPageQuiet } from "@/lib/api";
import { ALERT_INBOX_CHANGED } from "@/lib/alerts";
import { useI18n } from "./I18nProvider";

// 模块级去重：开发环境 StrictMode 双挂载只会发出一个未读数请求
let unreadInflight: Promise<number> | null = null;
function fetchUnreadCount(): Promise<number> {
  if (!unreadInflight) {
    unreadInflight = api.alertInbox(false, undefined, 1)
      .then(inbox => inbox.unread_count)
      .finally(() => { unreadInflight = null; });
  }
  return unreadInflight;
}

export default function NotificationBell() {
  const { localeTag } = useI18n();
  const zh = localeTag.startsWith("zh");
  const pathname = usePathname();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let alive = true, busy = false;
    // 所有触发路径（首刷/轮询/可见性变化/事件）共享同一个静默门：
    // 宿主在文档早期触发的 visibilitychange 等也不能绕过它提前发请求
    const gate = whenPageQuiet();
    async function refresh() {
      // 不用 AbortController 取消在途请求：Chrome 会把主动取消也记为 net::ERR_ABORTED 红错；
      // 请求仅十几毫秒，让它自然结束、用 alive 丢弃过期结果即可
      if (document.hidden || busy) return;
      busy = true;
      try { await gate; const unread = await fetchUnreadCount(); if (alive) setCount(unread); }
      catch { if (alive) setCount(null); }
      finally { busy = false; }
    }
    void refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener(ALERT_INBOX_CHANGED, refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { alive = false; clearInterval(timer); window.removeEventListener(ALERT_INBOX_CHANGED, refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [pathname]);
  const label = `${zh ? "通知中心" : "Notifications"}${count == null ? (zh ? "，未读数暂不可用" : ", count unavailable") : (zh ? `，${count} 条未读` : `, ${count} unread`)}`;
  return <Link href="/notifications" title={label} aria-label={label} className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-themed text-secondary hover:bg-surface-hover hover:text-primary" data-testid="notification-bell">
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>
    {count != null && count > 0 && <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1 text-center text-xs font-semibold text-on-accent">{count > 99 ? "99+" : count}</span>}
    {count == null && <span aria-hidden="true" className="absolute right-0 top-0 text-xs text-muted">·</span>}
  </Link>;
}
