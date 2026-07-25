import { SkeletonBase } from "./SkeletonBase";

/**
 * Skeleton for the RightPanel quote display while a quote is being fetched.
 */
export function QuoteDisplaySkeleton() {
  return (
    <div
      aria-label="Loading quote"
      aria-busy="true"
      className="flex flex-col gap-4 w-full"
    >
      {/* Hero panel */}
      <div className="border border-[#333333] bg-[#111111] p-5 flex flex-col gap-4">
        <SkeletonBase width={120} height={10} aria-label="Loading label…" />
        <SkeletonBase width="70%" height={38} aria-label="Loading payout amount…" />
        <SkeletonBase width={180} height={11} aria-label="Loading meta…" />
      </div>

      {/* Settlement breakdown */}
      <div className="border border-[#333333] bg-[#111111] p-5 flex flex-col gap-3">
        <SkeletonBase width={160} height={10} aria-label="Loading section title…" />

        {/* Network fee row */}
        <div className="flex items-center justify-between gap-4">
          <SkeletonBase width={90} height={12} aria-label="Loading fee label…" />
          <SkeletonBase width={80} height={12} aria-label="Loading fee value…" />
        </div>

        {/* Platform fee row */}
        <div className="flex items-center justify-between gap-4">
          <SkeletonBase width={90} height={12} aria-label="Loading fee label…" />
          <SkeletonBase width={80} height={12} aria-label="Loading fee value…" />
        </div>

        {/* Divider */}
        <div className="border-t border-[#333333] my-1" />

        {/* Payout total */}
        <div className="flex items-end justify-between gap-4">
          <SkeletonBase width={80} height={12} aria-label="Loading total label…" />
          <SkeletonBase width={120} height={24} aria-label="Loading payout total…" />
        </div>
      </div>
    </div>
  );
}
