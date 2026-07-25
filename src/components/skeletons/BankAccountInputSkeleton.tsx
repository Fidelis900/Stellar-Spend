import { SkeletonBase } from "./SkeletonBase";

/**
 * Skeleton for BankAccountInput while bank metadata (mode + field shape)
 * is loading. Renders three mode tabs and a single field row to match
 * the most common (Local) layout.
 */
export function BankAccountInputSkeleton({ fields = 1 }: { fields?: 1 | 2 }) {
  return (
    <div
      aria-label="Loading bank account input"
      aria-busy="true"
      className="flex flex-col gap-3"
    >
      {/* Mode tabs */}
      <div className="flex gap-4 border-b border-[#333333] pb-1">
        <SkeletonBase width={50} height={14} aria-label="Loading mode tab…" />
        <SkeletonBase width={70} height={14} aria-label="Loading mode tab…" />
        <SkeletonBase width={50} height={14} aria-label="Loading mode tab…" />
      </div>

      {/* Field rows */}
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <SkeletonBase width={110} height={11} aria-label="Loading field label…" />
          <SkeletonBase width="100%" height={46} aria-label="Loading field input…" />
        </div>
      ))}
    </div>
  );
}
