import type { Transaction } from "@/lib/transaction-storage";
import type { SearchFilters } from "@/lib/transaction-search";

// ---------------------------------------------------------------------------
// Filter model + pure transformations for the history view.
//
// The page keeps filter state as plain strings (so inputs bind directly), and
// these helpers translate that string shape to/from the URL, localStorage and
// the TransactionSearchService's SearchFilters shape.
// ---------------------------------------------------------------------------

export type SortField = "timestamp" | "amount" | "status";
export type SortDir = "asc" | "desc";

export interface Filters {
  search: string;
  status: Transaction["status"] | "all";
  currency: string; // "" = all
  dateFrom: string;
  dateTo: string;
  amountMin: string;
  amountMax: string;
  tags: string; // comma-separated tag names
  sortField: SortField;
  sortDir: SortDir;
}

export const DEFAULT_FILTERS: Filters = {
  search: "",
  status: "all",
  currency: "",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  tags: "",
  sortField: "timestamp",
  sortDir: "desc",
};

export const FILTERS_STORAGE_KEY = "stellar_spend_history_filters";

// Fields reflected in the URL so a filtered/sorted view can be shared via link.
export const URL_FILTER_KEYS = [
  "search", "status", "currency", "dateFrom", "dateTo",
  "amountMin", "amountMax", "tags", "sortField", "sortDir",
] as const satisfies ReadonlyArray<keyof Filters>;

export function filtersToSearchParams(filters: Filters): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of URL_FILTER_KEYS) {
    const value = filters[key];
    if (value && value !== DEFAULT_FILTERS[key]) {
      params.set(key, value);
    }
  }
  return params;
}

export function filtersFromSearchParams(params: URLSearchParams): Partial<Filters> {
  const result: Partial<Filters> = {};
  for (const key of URL_FILTER_KEYS) {
    const value = params.get(key);
    if (value !== null) {
      (result as Record<string, string>)[key] = value;
    }
  }
  return result;
}

/** Maps the page's string-based filter state onto transaction-search.ts's SearchFilters. */
export function toServiceFilters(filters: Filters): SearchFilters {
  const tags = filters.tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  return {
    query: filters.search.trim() || undefined,
    status: filters.status,
    currency: filters.currency || undefined,
    dateFrom: filters.dateFrom ? new Date(filters.dateFrom).getTime() : undefined,
    dateTo: filters.dateTo ? new Date(filters.dateTo).getTime() + 86_400_000 - 1 : undefined,
    amountMin: filters.amountMin !== "" && !isNaN(parseFloat(filters.amountMin))
      ? parseFloat(filters.amountMin) : undefined,
    amountMax: filters.amountMax !== "" && !isNaN(parseFloat(filters.amountMax))
      ? parseFloat(filters.amountMax) : undefined,
    tags: tags.length > 0 ? tags : undefined,
  };
}

/** Translate a SearchFilters object (preset/saved view) back to page filter state. */
export function fromServiceFilters(next: SearchFilters, prev: Filters): Filters {
  return {
    ...DEFAULT_FILTERS,
    sortField: prev.sortField,
    sortDir: prev.sortDir,
    status: next.status ?? "all",
    currency: next.currency ?? "",
    dateFrom: next.dateFrom ? new Date(next.dateFrom).toISOString().slice(0, 10) : "",
    dateTo: next.dateTo ? new Date(next.dateTo).toISOString().slice(0, 10) : "",
    amountMin: next.amountMin !== undefined ? String(next.amountMin) : "",
    amountMax: next.amountMax !== undefined ? String(next.amountMax) : "",
    tags: next.tags?.join(", ") ?? "",
  };
}

export function loadStoredFilters(): Filters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw);
    // Merge with defaults so older stored shapes don't drop new fields.
    return { ...DEFAULT_FILTERS, ...parsed };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function activeFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.search.trim()) count++;
  if (filters.status !== "all") count++;
  if (filters.currency) count++;
  if (filters.dateFrom) count++;
  if (filters.dateTo) count++;
  if (filters.amountMin) count++;
  if (filters.amountMax) count++;
  if (filters.tags.trim()) count++;
  return count;
}

/** Filter + sort transactions according to the current filter state. */
export function applyFilters(
  transactions: Transaction[],
  filters: Filters,
  search: (txs: Transaction[], f: SearchFilters) => Transaction[],
): Transaction[] {
  const result = search(transactions, toServiceFilters(filters));

  result.sort((a, b) => {
    let diff = 0;
    if (filters.sortField === "timestamp") diff = a.timestamp - b.timestamp;
    else if (filters.sortField === "amount")
      diff = parseFloat(a.amount) - parseFloat(b.amount);
    else if (filters.sortField === "status")
      diff = a.status.localeCompare(b.status);
    return filters.sortDir === "asc" ? diff : -diff;
  });

  return result;
}
