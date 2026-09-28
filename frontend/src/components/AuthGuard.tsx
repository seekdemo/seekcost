"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      setChecked(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [router]);

  if (!checked) {
    return (
      <div className="page-shell" aria-busy="true" aria-label="正在验证登录状态">
        <div className="loading-header">
          <span className="skeleton-block h-3 w-20" />
          <span className="skeleton-block mt-4 h-9 w-44" />
          <span className="skeleton-block mt-3 h-4 w-full max-w-sm" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => <span key={item} className="skeleton-block h-36 rounded-[var(--radius-xl)]" />)}
        </div>
        <span className="sr-only">加载中</span>
      </div>
    );
  }

  return <>{children}</>;
}
