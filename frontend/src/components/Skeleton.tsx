"use client";

/**
 * 骨架屏通用组件 — 页面加载时显示脉冲占位
 */

interface SkeletonProps {
  className?: string;
}

/** 基础骨架块 */
export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-lg bg-surface-hover ${className}`} />
  );
}

/** 仪表盘骨架屏 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8">
      {/* 页头 */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-16 rounded-lg" />
        </div>
      </div>

      {/* 净值卡片 */}
      <div className="rounded-2xl border border-themed bg-surface p-6">
        <Skeleton className="h-4 w-24 mb-3" />
        <Skeleton className="h-10 w-56 mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i}>
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      </div>

      {/* 资产列表 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-themed bg-surface p-4">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-4 w-12" />
            </div>
            <Skeleton className="h-4 w-32 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>

      {/* 安全分 + 图表 */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-themed bg-surface p-5">
          <Skeleton className="h-4 w-20 mb-3" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <div className="rounded-xl border border-themed bg-surface p-5">
          <Skeleton className="h-4 w-20 mb-3" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** 资产列表骨架屏 */
export function AssetsListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8 w-20 rounded-full" />
        ))}
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-xl border border-themed bg-surface p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div>
                <Skeleton className="h-5 w-24 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
            <div className="text-right">
              <Skeleton className="h-5 w-20 mb-1" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 个人资料骨架屏 */
export function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="rounded-xl border border-themed bg-surface p-6 flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div>
          <Skeleton className="h-6 w-28 mb-2" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl border border-themed bg-surface p-4">
          <Skeleton className="h-4 w-20 mb-3" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      ))}
    </div>
  );
}
