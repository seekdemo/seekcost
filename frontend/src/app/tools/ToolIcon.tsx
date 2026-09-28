"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";

const pending = new Map<string, Promise<string | null>>();

function loadIcon(url: string, direct: boolean) {
  const key = `${direct}:${url}`;
  if (!pending.has(key)) {
    if (pending.size > 128) pending.delete(pending.keys().next().value!);
    pending.set(key, fetch(`/api/v1/tools/icon?${new URLSearchParams({ url, direct: String(direct) })}`, {
      headers: { Authorization: `Bearer ${getToken()}` }, signal: AbortSignal.timeout(10000),
    }).then(async response => response.ok ? (await response.json()).icon || null : null).catch(() => null));
    // Retry failures on a later visit rather than permanently caching them.
    void pending.get(key)!.then(icon => { if (!icon) pending.delete(key); });
  }
  return pending.get(key)!;
}

export default function ToolIcon({ url, name, customUrl, className = "" }: {
  url: string; name: string; customUrl?: string | null; className?: string;
}) {
  const source = customUrl?.trim() || url.trim();
  const [loaded, setLoaded] = useState<{ source: string; icon: string } | null>(null);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      try {
        if (!["https:", "http:"].includes(new URL(source).protocol)) return;
        void loadIcon(source, Boolean(customUrl?.trim())).then(icon => {
          if (active) setLoaded(icon ? { source, icon } : null);
        });
      } catch { /* Invalid or incomplete input keeps the initial. */ }
    }, 600);
    return () => { active = false; clearTimeout(timer); };
  }, [source, customUrl]);
  const icon = loaded?.source === source ? loaded.icon : null;
  return <span aria-hidden="true" className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-md ${className}`}>
    {icon ? /* eslint-disable-next-line @next/next/no-img-element -- bounded raster data URL, no remote browser request */
      <img src={icon} alt="" className="h-full w-full object-contain p-1" onError={() => setLoaded(null)} />
      : <span>{name.trim().charAt(0).toUpperCase() || "↗"}</span>}
  </span>;
}
