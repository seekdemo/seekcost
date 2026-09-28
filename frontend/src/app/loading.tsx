export default function Loading() {
  return (
    <div className="page-shell" aria-label="页面加载中" aria-busy="true">
      <div className="loading-header">
        <span className="skeleton-block h-3 w-24" />
        <span className="skeleton-block mt-4 h-9 w-48" />
        <span className="skeleton-block mt-3 h-4 w-full max-w-md" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => <span key={item} className="skeleton-block h-40 rounded-[var(--radius-xl)]" />)}
      </div>
      <span className="sr-only">正在加载页面内容</span>
    </div>
  );
}
