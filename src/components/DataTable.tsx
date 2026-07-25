"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import VirtualList from "./VirtualList";

export type SortDirection = "asc" | "desc";

export interface DataTableColumn<T> {
  /** Unique column identifier, also used as the React key. */
  key: string;
  header: string;
  accessor: (row: T) => React.ReactNode;
  /** Provide to make the column sortable; returns the comparable value for a row. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  /** CSS grid track size used once the table switches to virtualized rendering. Defaults to "1fr". */
  width?: string;
  /** Hidden by default; the column remains togglable via the column-visibility menu. */
  hiddenByDefault?: boolean;
}

export type DataTableVariant = "dark-gold" | "light";

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: ReadonlyArray<T>;
  getRowKey: (row: T) => string;
  /** Accessible name for the table, used as aria-label. */
  caption: string;
  isLoading?: boolean;
  loadingState?: React.ReactNode;
  emptyState?: React.ReactNode;
  /** Enables pagination with this many rows per page. Omit to render all rows on one page. */
  pageSize?: number;
  /** Shows the column-visibility toggle menu. */
  enableColumnVisibility?: boolean;
  /** Switches to VirtualList rendering once the current page has more rows than this. */
  virtualizeThreshold?: number;
  /** Row height in px, required for virtualized rendering. */
  rowHeight?: number;
  /** Max height of the scrollable table body; header stays sticky within it. */
  maxBodyHeight?: number;
  /** Visual theme — "dark-gold" matches the main offramp UI, "light" matches the design-system Card/Badge surfaces. */
  variant?: DataTableVariant;
  className?: string;
  /**
   * Called when the user activates a row via Enter or Space.
   * Providing this callback also sets `role="button"` and `aria-label` on the row,
   * making it a keyboard-operable interactive element.
   */
  onRowActivate?: (row: T) => void;
}

const DEFAULT_ROW_HEIGHT = 49;
const DEFAULT_VIRTUALIZE_THRESHOLD = 50;

const THEME = {
  "dark-gold": {
    header: "bg-[#c9a962] text-[#0a0a0a]",
    headerFocusRing: "focus-visible:ring-[#0a0a0a]",
    border: "border-[#222222]",
    rowEven: "bg-[#111111]",
    rowOdd: "bg-[#0f0f0f]",
    rowHover: "hover:bg-[#1a1a1a]",
    cellText: "text-white",
    card: "border-[#222222] bg-[#111111]",
    cardLabel: "text-[#777777]",
    accent: "text-[#c9a962] border-[#c9a962] hover:bg-[#c9a962] hover:text-[#0a0a0a] focus-visible:ring-[#c9a962]",
    pageBtn: "border-[#333333] hover:border-[#c9a962] hover:text-[#c9a962] focus-visible:ring-[#c9a962]",
    pageText: "text-[#777777]",
    menu: "border-[#333333] bg-[#111111]",
    menuLabel: "text-[#aaaaaa] hover:text-white",
  },
  light: {
    header: "bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
    headerFocusRing: "focus-visible:ring-gray-400",
    border: "border-gray-200 dark:border-gray-700",
    rowEven: "bg-white dark:bg-gray-900",
    rowOdd: "bg-white dark:bg-gray-900",
    rowHover: "hover:bg-gray-50 dark:hover:bg-gray-800/50",
    cellText: "text-gray-900 dark:text-gray-100",
    card: "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
    cardLabel: "text-gray-500",
    accent: "text-blue-600 border-blue-600 hover:bg-blue-600 hover:text-white focus-visible:ring-blue-400",
    pageBtn: "border-gray-300 dark:border-gray-700 hover:border-blue-500 hover:text-blue-600 focus-visible:ring-blue-400",
    pageText: "text-gray-500",
    menu: "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900",
    menuLabel: "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white",
  },
} as const;

function alignClass(align: DataTableColumn<unknown>["align"]) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  caption,
  isLoading,
  loadingState,
  emptyState,
  pageSize,
  enableColumnVisibility,
  virtualizeThreshold = DEFAULT_VIRTUALIZE_THRESHOLD,
  rowHeight = DEFAULT_ROW_HEIGHT,
  maxBodyHeight = 420,
  variant = "dark-gold",
  className,
  onRowActivate,
}: DataTableProps<T>) {
  const theme = THEME[variant];
  const menuId = useId();
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>(null);
  const [page, setPage] = useState(0);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.key))
  );
  const [showColumnMenu, setShowColumnMenu] = useState(false);

  // Roving tabindex: track which row index is the current "tab stop" within the table.
  const [rovingIndex, setRovingIndex] = useState<number>(0);
  const rowRefs = useRef<Map<number, HTMLTableRowElement | HTMLDivElement>>(new Map());

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hiddenColumns.has(c.key)),
    [columns, hiddenColumns]
  );

  const sortedRows = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    const sortValue = column.sortValue;
    const sorted = [...rows].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av < bv) return -1;
      if (av > bv) return 1;
      return 0;
    });
    if (sort.direction === "desc") sorted.reverse();
    return sorted;
  }, [rows, sort, columns]);

  const totalPages = pageSize ? Math.max(1, Math.ceil(sortedRows.length / pageSize)) : 1;
  const currentPage = Math.min(page, totalPages - 1);
  const pagedRows = pageSize
    ? sortedRows.slice(currentPage * pageSize, currentPage * pageSize + pageSize)
    : sortedRows;

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, direction: "asc" };
      if (prev.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  }

  function toggleColumn(key: string) {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function sortAriaFor(key: string): "ascending" | "descending" | "none" {
    if (!sort || sort.key !== key) return "none";
    return sort.direction === "asc" ? "ascending" : "descending";
  }

  /**
   * Keyboard handler for roving tabindex navigation within table rows.
   * ArrowDown/ArrowUp move the focus between rows; Enter/Space activate the row.
   */
  const handleRowKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, row: T) => {
      const total = pagedRows.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const nextIndex = Math.min(index + 1, total - 1);
        setRovingIndex(nextIndex);
        rowRefs.current.get(nextIndex)?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prevIndex = Math.max(index - 1, 0);
        setRovingIndex(prevIndex);
        rowRefs.current.get(prevIndex)?.focus();
      } else if ((e.key === "Enter" || e.key === " ") && onRowActivate) {
        e.preventDefault();
        onRowActivate(row);
      }
    },
    [pagedRows.length, onRowActivate],
  );

  const registerRowRef = useCallback(
    (el: HTMLTableRowElement | HTMLDivElement | null, index: number) => {
      if (el) {
        rowRefs.current.set(index, el);
      } else {
        rowRefs.current.delete(index);
      }
    },
    [],
  );

  if (isLoading) return <>{loadingState ?? null}</>;
  if (rows.length === 0) return <>{emptyState ?? null}</>;

  // Plain function (not a JSX component) so its output is inlined into the
  // parent's children rather than mounted as a separate fiber — a nested
  // component recreated on every render would force React to remount the
  // <button> each time, detaching it from any previously queried/focused ref.
  function renderHeaderContent(col: DataTableColumn<T>): React.ReactNode {
    if (!col.sortValue) return col.header;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col.key)}
        className={cn(
          "inline-flex items-center gap-1 hover:underline focus:outline-none focus-visible:ring-1",
          theme.headerFocusRing
        )}
      >
        {col.header}
        <span aria-hidden="true" className="text-[8px]">
          {sort?.key === col.key ? (sort.direction === "asc" ? "▲" : "▼") : ""}
        </span>
      </button>
    );
  }

  const shouldVirtualize = pagedRows.length > virtualizeThreshold;
  const gridTemplateColumns = visibleColumns.map((c) => c.width ?? "1fr").join(" ");

  const columnMenu = enableColumnVisibility && (
    <div className="flex justify-end px-1 pb-2">
      <div className="relative">
        <button
          type="button"
          aria-expanded={showColumnMenu}
          aria-controls={menuId}
          onClick={() => setShowColumnMenu((v) => !v)}
          className={cn(
            "text-[10px] tracking-widest uppercase border px-3 py-1.5 transition-colors duration-150 focus:outline-none focus-visible:ring-1",
            theme.accent
          )}
        >
          Columns
        </button>
        {showColumnMenu && (
          <div
            id={menuId}
            role="menu"
            className={cn("absolute right-0 mt-1 z-20 w-48 border p-2 shadow-lg", theme.menu)}
          >
            {columns.map((col) => (
              <label
                key={col.key}
                className={cn("flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer", theme.menuLabel)}
              >
                <input
                  type="checkbox"
                  checked={!hiddenColumns.has(col.key)}
                  onChange={() => toggleColumn(col.key)}
                  className="accent-current"
                />
                {col.header}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const pagination = pageSize && totalPages > 1 && (
    <div className={cn("flex items-center justify-between px-1 pt-3 text-[10px] tracking-widest uppercase", theme.pageText)}>
      <button
        type="button"
        onClick={() => setPage((p) => Math.max(0, p - 1))}
        disabled={currentPage === 0}
        className={cn("px-3 py-1.5 border disabled:opacity-40 transition-colors duration-150 focus:outline-none focus-visible:ring-1", theme.pageBtn)}
      >
        Previous
      </button>
      <span aria-live="polite">
        Page {currentPage + 1} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        disabled={currentPage >= totalPages - 1}
        className={cn("px-3 py-1.5 border disabled:opacity-40 transition-colors duration-150 focus:outline-none focus-visible:ring-1", theme.pageBtn)}
      >
        Next
      </button>
    </div>
  );

  // Stacked card layout used below the md breakpoint regardless of virtualization.
  const cardLayout = (
    <ul className="md:hidden space-y-2">
      {pagedRows.map((row) => (
        <li key={getRowKey(row)} className={cn("border p-3 space-y-1.5", theme.card)}>
          {visibleColumns.map((col) => (
            <div key={col.key} className="flex items-center justify-between gap-3 text-xs">
              <span className={cn("text-[10px] tracking-widest uppercase", theme.cardLabel)}>{col.header}</span>
              <span className={cn("text-right", theme.cellText)}>{col.accessor(row)}</span>
            </div>
          ))}
        </li>
      ))}
    </ul>
  );

  if (shouldVirtualize) {
    // Virtualized rendering uses an ARIA grid (div-based rows) so column widths
    // stay in sync between the sticky header and VirtualList's windowed rows.
    return (
      <div className={className}>
        {columnMenu}
        <div
          role="table"
          aria-label={caption}
          className={cn("hidden md:block border", theme.border)}
        >
          <div role="rowgroup" className="sticky top-0 z-10">
            <div role="row" className={cn("grid", theme.header)} style={{ gridTemplateColumns }}>
              {visibleColumns.map((col) => (
                <div
                  key={col.key}
                  role="columnheader"
                  aria-sort={col.sortValue ? sortAriaFor(col.key) : undefined}
                  className={cn(
                    "px-5 py-2.5 text-[10px] tracking-[0.18em] font-semibold uppercase whitespace-nowrap",
                    alignClass(col.align)
                  )}
                >
                  {renderHeaderContent(col)}
                </div>
              ))}
            </div>
          </div>
          <div role="rowgroup">
            <VirtualList
              items={pagedRows}
              itemHeight={rowHeight}
              containerHeight={Math.min(maxBodyHeight, pagedRows.length * rowHeight)}
              renderItem={(row, i) => (
                <div
                  ref={(el) => registerRowRef(el, i)}
                  role="row"
                  tabIndex={i === rovingIndex ? 0 : -1}
                  onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                  onKeyDown={(e) => handleRowKeyDown(e, i, row)}
                  onFocus={() => setRovingIndex(i)}
                  className={cn(
                    "grid border-b transition-colors duration-100",
                    theme.border,
                    i % 2 === 0 ? theme.rowEven : theme.rowOdd,
                    theme.rowHover,
                    onRowActivate && "cursor-pointer",
                  )}
                  style={{ gridTemplateColumns }}
                >
                  {visibleColumns.map((col) => (
                    <div
                      key={col.key}
                      role="cell"
                      className={cn("px-5 py-3 text-xs whitespace-nowrap flex items-center", theme.cellText, alignClass(col.align), col.className)}
                    >
                      {col.accessor(row)}
                    </div>
                  ))}
                </div>
              )}
            />
          </div>
        </div>
        {cardLayout}
        {pagination}
      </div>
    );
  }

  return (
    <div className={className}>
      {columnMenu}
      <div className="hidden md:block overflow-auto" style={{ maxHeight: maxBodyHeight }}>
        <table className="w-full min-w-[520px] border-collapse" aria-label={caption}>
          <thead className="sticky top-0 z-10">
            <tr className={theme.header}>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortValue ? sortAriaFor(col.key) : undefined}
                  className={cn(
                    "px-5 py-2.5 text-[10px] tracking-[0.18em] font-semibold uppercase whitespace-nowrap",
                    alignClass(col.align)
                  )}
                >
                  {renderHeaderContent(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.map((row, i) => (
              <tr
                key={getRowKey(row)}
                ref={(el) => registerRowRef(el, i)}
                tabIndex={i === rovingIndex ? 0 : -1}
                aria-selected={onRowActivate ? undefined : undefined}
                role={onRowActivate ? "row" : undefined}
                onClick={onRowActivate ? () => onRowActivate(row) : undefined}
                onKeyDown={(e) => handleRowKeyDown(e, i, row)}
                onFocus={() => setRovingIndex(i)}
                className={cn(
                  "border-b transition-colors duration-100",
                  theme.border,
                  i % 2 === 0 ? theme.rowEven : theme.rowOdd,
                  theme.rowHover,
                  onRowActivate && "cursor-pointer",
                )}
              >
                {visibleColumns.map((col) => (
                  <td
                    key={col.key}
                    className={cn("px-5 py-3 text-xs whitespace-nowrap", theme.cellText, alignClass(col.align), col.className)}
                  >
                    {col.accessor(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cardLayout}
      {pagination}
    </div>
  );
}

export default DataTable;
