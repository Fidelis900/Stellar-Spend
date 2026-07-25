"use client";

import { cn } from "@/lib/cn";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

interface HistoryPaginationProps {
  page: number; // 1-based
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

const buttonClass = cn(
  "text-[10px] tracking-widest uppercase px-3 py-2 min-h-[36px] border border-[#333333] text-[#999999]",
  "hover:border-[#c9a962] hover:text-[#c9a962] transition-colors duration-150",
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-[#333333] disabled:hover:text-[#999999]",
);

/** Client-side pagination controls for the history table. */
export function HistoryPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: HistoryPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const first = totalItems === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const last = Math.min(clampedPage * pageSize, totalItems);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-[#777777] uppercase tracking-widest">Rows</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Rows per page"
          className="bg-[#0a0a0a] border border-[#333333] px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#c9a962]"
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>

      <p className="text-[10px] text-[#777777] tracking-widest tabular-nums" aria-live="polite">
        {first}–{last} of {totalItems}
      </p>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(clampedPage - 1)}
          disabled={clampedPage <= 1}
          className={buttonClass}
          aria-label="Previous page"
        >
          ← Prev
        </button>
        <span className="text-[10px] text-[#999999] tracking-widest tabular-nums">
          Page {clampedPage} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(clampedPage + 1)}
          disabled={clampedPage >= totalPages}
          className={buttonClass}
          aria-label="Next page"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
