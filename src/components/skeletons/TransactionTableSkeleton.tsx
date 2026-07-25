import { SkeletonBase } from "./SkeletonBase";
import { cn } from "@/lib/cn";

interface TransactionTableSkeletonProps {
  rows?: number;
}

/**
 * Skeleton for the RecentOfframpsTable while transactions are loading.
 */
export function TransactionTableSkeleton({ rows = 3 }: TransactionTableSkeletonProps) {
  return (
    <div
      aria-label="Loading recent transactions"
      aria-busy="true"
      className="border border-[#333333] bg-[#111111]"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#333333]">
        <SkeletonBase width={120} height={10} aria-label="Loading section title…" />
        <SkeletonBase width={64} height={26} aria-label="Loading view all link…" />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse" aria-label="Loading transactions table">
          <thead>
            <tr className="bg-[#c9a962]">
              {["TX HASH", "USDC", "FIAT", "STATUS"].map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="px-5 py-2.5 text-left text-[10px] tracking-[0.18em] font-semibold text-[#0a0a0a] uppercase whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <tr
                key={i}
                className={cn("border-b border-[#222222]", i % 2 === 0 ? "bg-[#111111]" : "bg-[#0f0f0f]")}
              >
                <td className="px-5 py-3"><SkeletonBase width={120} height={14} aria-label="Loading transaction hash…" /></td>
                <td className="px-5 py-3"><SkeletonBase width={80} height={14} aria-label="Loading USDC amount…" /></td>
                <td className="px-5 py-3"><SkeletonBase width={80} height={14} aria-label="Loading fiat amount…" /></td>
                <td className="px-5 py-3"><SkeletonBase width={60} height={20} aria-label="Loading status…" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
