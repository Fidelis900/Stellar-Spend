import { describe, it, expect } from "vitest";
import type { Transaction } from "@/lib/transaction-storage";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  applyFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
  fromServiceFilters,
  toServiceFilters,
  type Filters,
} from "./filters";

const make = (overrides: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...overrides });

const tx = (o: Partial<Transaction> = {}): Transaction => ({
  id: "1",
  timestamp: 100,
  userAddress: "G",
  amount: "10",
  currency: "NGN",
  beneficiary: { institution: "B", accountIdentifier: "1", accountName: "A", currency: "NGN" },
  status: "completed",
  ...o,
});

describe("filters helpers", () => {
  it("only serialises non-default fields to URL params", () => {
    const params = filtersToSearchParams(make({ search: "abc", status: "all" }));
    expect(params.get("search")).toBe("abc");
    expect(params.get("status")).toBeNull();
  });

  it("round-trips through search params", () => {
    const params = filtersToSearchParams(make({ currency: "NGN", amountMin: "5" }));
    const parsed = filtersFromSearchParams(params);
    expect(parsed).toMatchObject({ currency: "NGN", amountMin: "5" });
  });

  it("toServiceFilters trims and splits tags, drops empties", () => {
    const svc = toServiceFilters(make({ search: "  q ", tags: "a, ,b " }));
    expect(svc.query).toBe("q");
    expect(svc.tags).toEqual(["a", "b"]);
  });

  it("fromServiceFilters preserves sort and maps amounts back to strings", () => {
    const prev = make({ sortField: "amount", sortDir: "asc" });
    const next = fromServiceFilters({ amountMin: 5, status: "failed" }, prev);
    expect(next.sortField).toBe("amount");
    expect(next.sortDir).toBe("asc");
    expect(next.amountMin).toBe("5");
    expect(next.status).toBe("failed");
  });

  it("activeFilterCount counts only meaningful filters", () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(activeFilterCount(make({ search: "x", currency: "NGN" }))).toBe(2);
  });

  it("applyFilters sorts ascending/descending by the chosen field", () => {
    const txs = [tx({ id: "a", amount: "30" }), tx({ id: "b", amount: "10" })];
    const identity = (t: Transaction[]) => [...t];

    const desc = applyFilters(txs, make({ sortField: "amount", sortDir: "desc" }), identity);
    expect(desc.map((t) => t.id)).toEqual(["a", "b"]);

    const asc = applyFilters(txs, make({ sortField: "amount", sortDir: "asc" }), identity);
    expect(asc.map((t) => t.id)).toEqual(["b", "a"]);
  });
});
