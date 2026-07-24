import { SkeletonBase } from "./SkeletonBase";

/**
 * Skeleton for the Header wallet area while balance is loading.
 */
export function WalletConnectionSkeleton() {
  return (
    <div
      aria-label="Loading wallet"
      aria-busy="true"
      className="flex flex-col items-end gap-0.5"
    >
      <SkeletonBase width={100} height={12} aria-label="Loading USDC balance…" />
      <SkeletonBase width={70} height={12} aria-label="Loading XLM balance…" />
    </div>
  );
}
