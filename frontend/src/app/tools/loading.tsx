export default function ToolsLoading() {
  return (
    <div className="page-shell page-shell--wide" aria-label="Loading investment tools" aria-busy="true">
      <div className="loading-header">
        <span className="skeleton-block h-3 w-32" />
        <span className="skeleton-block mt-4 h-9 w-72 max-w-full" />
        <span className="skeleton-block mt-3 h-4 w-full max-w-xl" />
      </div>
      <span className="skeleton-block h-24 rounded-lg" />
      <div className="tools-directory__masonry grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((item) => <span key={item} className="tools-directory__skeleton skeleton-block h-[250px] rounded-lg" />)}
      </div>
    </div>
  );
}
