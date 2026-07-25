"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { getCurrencyFlag } from "@/lib/currency-flags";
import type { Filters } from "../filters";

interface FilterInputsProps {
  filters: Filters;
  availableCurrencies: string[];
  hasActiveFilters: boolean;
  onChange: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  onClear: () => void;
}

const inputClass = cn(
  "bg-[#0a0a0a] border border-[#333333] px-3 py-2 text-xs text-white",
  "placeholder-[#555555] focus:outline-none focus:border-[#c9a962]",
);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] text-[#777777] uppercase tracking-widest">{label}</label>
      {children}
    </div>
  );
}

/** The grid of filter inputs (search, status, currency, dates, amounts, tags). */
export function FilterInputs({
  filters,
  availableCurrencies,
  hasActiveFilters,
  onChange,
  onClear,
}: FilterInputsProps) {
  return (
    <div className="flex flex-wrap gap-3 items-end">
      <Field label="Search">
        <input
          type="text"
          value={filters.search}
          onChange={(e) => onChange("search", e.target.value)}
          placeholder="TX hash, ID, or note"
          aria-label="Search transactions"
          className={cn(inputClass, "w-48")}
        />
      </Field>
      <Field label="Status">
        <select
          value={filters.status}
          onChange={(e) => onChange("status", e.target.value as Filters["status"])}
          aria-label="Filter by status"
          className={inputClass}
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="reversed">Reversed</option>
          <option value="partially_reversed">Partially reversed</option>
        </select>
      </Field>
      <Field label="Currency">
        <select
          value={filters.currency}
          onChange={(e) => onChange("currency", e.target.value)}
          aria-label="Filter by currency"
          disabled={availableCurrencies.length === 0}
          className={cn(inputClass, "disabled:opacity-50 disabled:cursor-not-allowed")}
        >
          <option value="">All</option>
          {availableCurrencies.map((c) => (
            <option key={c} value={c}>
              {getCurrencyFlag(c) ? `${getCurrencyFlag(c)} ${c}` : c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Tags">
        <input
          type="text"
          value={filters.tags}
          onChange={(e) => onChange("tags", e.target.value)}
          placeholder="comma, separated"
          aria-label="Filter by tags"
          className={cn(inputClass, "w-40")}
        />
      </Field>
      <Field label="From">
        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => onChange("dateFrom", e.target.value)}
          aria-label="Filter from date"
          className={cn(inputClass, "[color-scheme:dark]")}
        />
      </Field>
      <Field label="To">
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => onChange("dateTo", e.target.value)}
          aria-label="Filter to date"
          className={cn(inputClass, "[color-scheme:dark]")}
        />
      </Field>
      <Field label="Min USDC">
        <input
          type="number"
          value={filters.amountMin}
          onChange={(e) => onChange("amountMin", e.target.value)}
          placeholder="0"
          aria-label="Minimum amount"
          className={cn(inputClass, "w-24")}
        />
      </Field>
      <Field label="Max USDC">
        <input
          type="number"
          value={filters.amountMax}
          onChange={(e) => onChange("amountMax", e.target.value)}
          placeholder="∞"
          aria-label="Maximum amount"
          className={cn(inputClass, "w-24")}
        />
      </Field>

      {hasActiveFilters && (
        <button
          onClick={onClear}
          className={cn(
            "ml-auto text-[10px] tracking-widest uppercase px-3 py-2",
            "border border-[#555555] text-[#777777]",
            "hover:border-[#c9a962] hover:text-[#c9a962] transition-colors duration-150",
          )}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
