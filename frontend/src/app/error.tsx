"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="error-state" role="alert">
      <span className="error-state__icon" aria-hidden="true">!</span>
      <p className="error-state__eyebrow">页面暂时不可用</p>
      <h1>没有加载成功</h1>
      <p>你的数据没有受到影响。可以重试一次，或稍后回到这里。</p>
      <button type="button" onClick={reset} className="ui-button ui-button--primary">重新加载</button>
    </div>
  );
}
