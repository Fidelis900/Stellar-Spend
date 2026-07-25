import { SkeletonBase } from "./SkeletonBase";

/**
 * Skeleton for AnalyticsDashboard while analytics data is being fetched.
 * Mirrors the period selector, metric cards, funnel, currency breakdown,
 * fee analysis, and spending patterns sections so there's no layout shift.
 */
export function AnalyticsDashboardSkeleton() {
  return (
    <div
      aria-label="Loading analytics"
      aria-busy="true"
      className="space-y-6"
    >
      {/* Period selector */}
      <div className="flex gap-2">
        <SkeletonBase width={110} height={36} aria-label="Loading period option…" />
        <SkeletonBase width={110} height={36} aria-label="Loading period option…" />
        <SkeletonBase width={110} height={36} aria-label="Loading period option…" />
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white p-4 rounded-lg border flex flex-col gap-2"
          >
            <SkeletonBase width="60%" height={12} aria-label="Loading metric label…" />
            <SkeletonBase width="80%" height={24} aria-label="Loading metric value…" />
          </div>
        ))}
      </div>

      {/* Funnel block */}
      <div className="bg-gray-900 p-6 rounded-lg border border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <SkeletonBase width={180} height={18} aria-label="Loading funnel title…" />
          <SkeletonBase width={100} height={14} aria-label="Loading funnel meta…" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBase
              key={i}
              width={`${100 - i * 15}%`}
              height={28}
              aria-label="Loading funnel step…"
            />
          ))}
        </div>
      </div>

      {/* Currency breakdown */}
      <div className="bg-white p-6 rounded-lg border">
        <SkeletonBase width={180} height={18} className="mb-4" aria-label="Loading section title…" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex flex-col gap-1.5">
                <SkeletonBase width={60} height={14} aria-label="Loading currency…" />
                <SkeletonBase width={100} height={11} aria-label="Loading transaction count…" />
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <SkeletonBase width={80} height={14} aria-label="Loading volume…" />
                <SkeletonBase width={40} height={11} aria-label="Loading percentage…" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Fee analysis */}
      <div className="bg-white p-6 rounded-lg border">
        <SkeletonBase width={140} height={18} className="mb-4" aria-label="Loading section title…" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <SkeletonBase width="70%" height={11} aria-label="Loading fee label…" />
              <SkeletonBase width="50%" height={22} aria-label="Loading fee value…" />
            </div>
          ))}
        </div>
      </div>

      {/* Spending patterns */}
      <div className="bg-white p-6 rounded-lg border">
        <SkeletonBase width={180} height={18} className="mb-4" aria-label="Loading section title…" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between py-2 border-b"
            >
              <div className="flex flex-col gap-1.5">
                <SkeletonBase width={100} height={14} aria-label="Loading date…" />
                <SkeletonBase width={140} height={11} aria-label="Loading transaction count…" />
              </div>
              <SkeletonBase width={70} height={16} aria-label="Loading amount…" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
